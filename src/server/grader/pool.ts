/**
 * Pool of pre-warmed sandbox processes + job scheduler.
 *
 * - Keeps `poolSize` sandboxes loading/ready in the background.
 * - Every job (one submission = all code questions of one attempt, or one
 *   run) takes a fresh sandbox; it is killed when the job ends and replaced,
 *   so students never share an interpreter. After a timeout/crash inside a
 *   job the job continues in another fresh sandbox.
 * - At most `maxConcurrency` jobs run at once; others wait in a queue.
 *   Interactive jobs (someone is waiting for the answer) start before
 *   background jobs (grading of submitted attempts), each in FIFO order.
 *   A job gives up after its queue timeout (default `queueTimeoutMs`);
 *   background grading passes `null` and waits as long as needed, so a busy
 *   grader delays results instead of losing them.
 * - Infrastructure failures are thrown as GraderUnavailableError
 *   (QueueTimeoutError, SandboxStartError; see ./errors.ts).
 */
import fs from "node:fs";
import { type GraderConfig, graderConfig } from "./config";
import { QueueTimeoutError, SandboxStartError } from "./errors";
import { SandboxProcess } from "./sandbox-process";
import { makeSnapshot } from "./snapshot";

export { QueueTimeoutError, SandboxStartError };

export type JobPriority = "interactive" | "background";

export type JobOptions = {
  /**
   * Max time to wait for a free slot before failing with QueueTimeoutError.
   * Default: GRADER_QUEUE_TIMEOUT_MS. `null`: wait as long as needed.
   */
  queueTimeoutMs?: number | null;
  /** Default "interactive"; "background" jobs wait behind interactive ones. */
  priority?: JobPriority;
};

export type PoolStats = {
  warm: number;
  ready: number;
  runningJobs: number;
  queuedJobs: number;
  queuedBackgroundJobs: number;
  spawned: number;
  startupFailures: number;
};

type QueueEntry = {
  start: () => void;
  timer: ReturnType<typeof setTimeout> | null;
};

/** A job's handle on its current sandbox (replaced after timeouts/crashes). */
export class JobLease {
  private proc: SandboxProcess | null = null;
  private disposed = false;
  constructor(private readonly pool: SandboxPool) {}

  /** The job's sandbox; throws SandboxStartError when none can be started. */
  async current(): Promise<SandboxProcess> {
    if (this.disposed) throw new Error("lease disposed");
    if (!this.proc || !this.proc.alive) {
      try {
        this.proc = await this.pool.take();
      } catch (e) {
        throw new SandboxStartError(e);
      }
    }
    return this.proc;
  }

  /** Kill the current sandbox; the next `current()` takes a fresh one. */
  discard(): void {
    this.proc?.kill("killed", "discarded by job");
    this.proc = null;
  }

  dispose(): void {
    this.discard();
    this.disposed = true;
  }
}

export class SandboxPool {
  private warm: SandboxProcess[] = [];
  private running = 0;
  private readonly queues: Record<JobPriority, QueueEntry[]> = {
    interactive: [],
    background: [],
  };
  private spawned = 0;
  private startupFailures = 0;
  private recentFailures: number[] = [];
  private refillTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;
  private snapshotPath: string | null = null;
  private snapshotState: "none" | "making" | "ready" | "failed" = "none";

  constructor(readonly config: GraderConfig = graderConfig()) {}

  stats(): PoolStats {
    return {
      warm: this.warm.length,
      ready: this.warm.filter((p) => p.isReady).length,
      runningJobs: this.running,
      queuedJobs:
        this.queues.interactive.length + this.queues.background.length,
      queuedBackgroundJobs: this.queues.background.length,
      spawned: this.spawned,
      startupFailures: this.startupFailures,
    };
  }

  /** Make the start-up snapshot once, in the background (see snapshot.ts). */
  private ensureSnapshot(): void {
    if (this.snapshotState !== "none" || process.env.GRADER_SNAPSHOT === "0")
      return;
    this.snapshotState = "making";
    makeSnapshot(this.config)
      .then((file) => {
        if (this.closed) {
          fs.rmSync(file, { force: true });
          return;
        }
        this.snapshotPath = file;
        this.snapshotState = "ready";
        const cleanup = () => {
          try {
            fs.rmSync(file, { force: true });
          } catch {
            // ignore
          }
        };
        process.once("exit", cleanup);
        // Replace warm sandboxes that are still loading the slow way? No:
        // they finish soon; new ones use the snapshot.
      })
      .catch((e) => {
        this.snapshotState = "failed";
        console.warn(
          `[grader] snapshot unavailable, using normal start-up: ${e instanceof Error ? e.message : e}`,
        );
      });
  }

  /** Path of the start-up snapshot, once available. */
  get snapshot(): string | null {
    return this.snapshotPath;
  }

  private spawnOne(): SandboxProcess {
    this.ensureSnapshot();
    const proc = new SandboxProcess(this.config, this.snapshotPath);
    this.spawned++;
    proc.ready.catch(() => {
      this.startupFailures++;
      this.recentFailures.push(Date.now());
      this.warm = this.warm.filter((p) => p !== proc);
      this.scheduleRefill();
    });
    return proc;
  }

  /** Top the warm pool up to `poolSize` (backs off after repeated start-up failures). */
  warmUp(): void {
    if (this.closed) return;
    this.warm = this.warm.filter((p) => p.alive);
    const now = Date.now();
    this.recentFailures = this.recentFailures.filter((t) => now - t < 30_000);
    if (this.recentFailures.length >= 3) {
      this.scheduleRefill(10_000);
      return;
    }
    while (this.warm.length < this.config.poolSize)
      this.warm.push(this.spawnOne());
  }

  private scheduleRefill(delayMs = 250): void {
    if (this.refillTimer || this.closed) return;
    this.refillTimer = setTimeout(() => {
      this.refillTimer = null;
      this.warmUp();
    }, delayMs);
    this.refillTimer.unref?.();
  }

  /** Take a sandbox for exclusive use (warm if possible) and wait until it's ready. */
  async take(): Promise<SandboxProcess> {
    this.warm = this.warm.filter((p) => p.alive);
    let attempt = 0;
    for (;;) {
      const idx = this.warm.findIndex((p) => p.isReady);
      const proc =
        idx >= 0
          ? this.warm.splice(idx, 1)[0]
          : (this.warm.shift() ?? this.spawnOne());
      this.scheduleRefill(0);
      try {
        await proc.ready;
        if (proc.alive) return proc;
      } catch (e) {
        if (++attempt >= 2) throw e;
      }
    }
  }

  private acquireSlot(
    priority: JobPriority,
    timeoutMs: number | null,
  ): Promise<void> {
    // A free slot means nothing is queued (releaseSlot starts the next job).
    if (this.running < this.config.maxConcurrency) {
      this.running++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const queue = this.queues[priority];
      const entry: QueueEntry = {
        start: () => {
          if (entry.timer) clearTimeout(entry.timer);
          this.running++;
          resolve();
        },
        timer: null,
      };
      if (timeoutMs !== null) {
        entry.timer = setTimeout(() => {
          const idx = queue.indexOf(entry);
          if (idx >= 0) queue.splice(idx, 1);
          reject(new QueueTimeoutError());
        }, timeoutMs);
      }
      queue.push(entry);
    });
  }

  private releaseSlot(): void {
    this.running--;
    const next =
      this.queues.interactive.shift() ?? this.queues.background.shift();
    if (next) next.start();
  }

  /** Run a job with exclusive sandboxes; they are killed when the job ends. */
  async withJob<T>(
    fn: (lease: JobLease) => Promise<T>,
    options: JobOptions = {},
  ): Promise<T> {
    this.warmUp();
    await this.acquireSlot(
      options.priority ?? "interactive",
      options.queueTimeoutMs === undefined
        ? this.config.queueTimeoutMs
        : options.queueTimeoutMs,
    );
    const lease = new JobLease(this);
    try {
      return await fn(lease);
    } finally {
      lease.dispose();
      this.releaseSlot();
      this.scheduleRefill(0);
    }
  }

  /** Kill every sandbox (tests / shutdown). */
  close(): void {
    this.closed = true;
    for (const p of this.warm) p.kill("killed", "pool closed");
    this.warm = [];
    if (this.refillTimer) clearTimeout(this.refillTimer);
    if (this.snapshotPath) fs.rmSync(this.snapshotPath, { force: true });
    this.snapshotPath = null;
  }
}

type GlobalWithPool = typeof globalThis & { __pensumaGraderPool?: SandboxPool };

/** The process-wide pool (survives dev hot reloads). */
export function getGraderPool(): SandboxPool {
  const g = globalThis as GlobalWithPool;
  if (!g.__pensumaGraderPool) {
    g.__pensumaGraderPool = new SandboxPool();
  }
  return g.__pensumaGraderPool;
}
