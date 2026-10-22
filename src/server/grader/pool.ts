/**
 * Pool of pre-warmed sandbox processes + job scheduler.
 *
 * - Keeps `poolSize` sandboxes loading/ready in the background.
 * - Every job (one submission = all tests of one question, or one run) takes
 *   a fresh sandbox; it is killed when the job ends and replaced, so
 *   students never share an interpreter. After a timeout/crash inside a job
 *   the job continues in another fresh sandbox.
 * - At most `maxConcurrency` jobs run at once; others wait in a FIFO queue
 *   (up to `queueTimeoutMs`).
 */
import { type GraderConfig, graderConfig } from "./config";
import { SandboxProcess } from "./sandbox-process";

export class QueueTimeoutError extends Error {
  constructor() {
    super("Het nakijken is op dit moment erg druk. Probeer het zo opnieuw.");
    this.name = "QueueTimeoutError";
  }
}

export type PoolStats = {
  warm: number;
  ready: number;
  runningJobs: number;
  queuedJobs: number;
  spawned: number;
  startupFailures: number;
};

/** A job's handle on its current sandbox (replaced after timeouts/crashes). */
export class JobLease {
  private proc: SandboxProcess | null = null;
  private disposed = false;
  constructor(private readonly pool: SandboxPool) {}

  async current(): Promise<SandboxProcess> {
    if (this.disposed) throw new Error("lease disposed");
    if (!this.proc || !this.proc.alive) this.proc = await this.pool.take();
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
  private queue: { start: () => void; timer: ReturnType<typeof setTimeout> }[] =
    [];
  private spawned = 0;
  private startupFailures = 0;
  private recentFailures: number[] = [];
  private refillTimer: ReturnType<typeof setTimeout> | null = null;
  private closed = false;

  constructor(readonly config: GraderConfig = graderConfig()) {}

  stats(): PoolStats {
    return {
      warm: this.warm.length,
      ready: this.warm.filter((p) => p.isReady).length,
      runningJobs: this.running,
      queuedJobs: this.queue.length,
      spawned: this.spawned,
      startupFailures: this.startupFailures,
    };
  }

  private spawnOne(): SandboxProcess {
    const proc = new SandboxProcess(this.config);
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

  private acquireSlot(): Promise<void> {
    if (this.running < this.config.maxConcurrency) {
      this.running++;
      return Promise.resolve();
    }
    return new Promise<void>((resolve, reject) => {
      const entry = {
        start: () => {
          clearTimeout(entry.timer);
          this.running++;
          resolve();
        },
        timer: setTimeout(() => {
          this.queue = this.queue.filter((q) => q !== entry);
          reject(new QueueTimeoutError());
        }, this.config.queueTimeoutMs),
      };
      this.queue.push(entry);
    });
  }

  private releaseSlot(): void {
    this.running--;
    const next = this.queue.shift();
    if (next) next.start();
  }

  /** Run a job with exclusive sandboxes; they are killed when the job ends. */
  async withJob<T>(fn: (lease: JobLease) => Promise<T>): Promise<T> {
    this.warmUp();
    await this.acquireSlot();
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
