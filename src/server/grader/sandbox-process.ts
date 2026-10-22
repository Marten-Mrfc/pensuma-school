/**
 * One sandboxed Pyodide child process (see grader/sandbox.mjs for the child
 * side, the threat model and residual risks).
 *
 * Process-level lockdown applied here:
 *  - `env: {}`: no secrets in process.env or /proc/self/environ
 *  - cwd: the sandbox folder (read-only, contains only sandbox.mjs)
 *  - Node permission model: `--permission` with `--allow-fs-read` limited to
 *    the pyodide package folder and the sandbox folder. No --allow-fs-write,
 *    --allow-child-process, --allow-worker, --allow-addons or --allow-wasi.
 *  - `--disallow-code-generation-from-strings` (no eval/new Function)
 *  - `--max-old-space-size` for the JS heap; the child caps wasm memory; an
 *    RSS watchdog here kills the child above `memoryLimitMb`
 *  - `--no-experimental-fetch/websocket/global-navigator`, `--no-addons`,
 *    `--disable-sigusr1` (no inspector activation via signal)
 *  - timeouts: the child is SIGKILLed when a request takes too long
 * The child's stdout is untrusted: lines are size-capped and parsed strictly.
 */
import { type ChildProcess, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { HARNESS_FILENAME, HARNESS_PY } from "@/lib/python/harness";
import type { GraderConfig } from "./config";

export type SandboxFailure =
  | "timeout"
  | "memory"
  | "exit"
  | "protocol"
  | "fatal"
  | "startup"
  | "killed";

export type SandboxMessage = { t: string; id?: string } & Record<
  string,
  unknown
>;

export type SandboxResponse =
  | { ok: true; message: SandboxMessage; durationMs: number }
  | { ok: false; failure: SandboxFailure; message: string; durationMs: number };

/** A result line can't legitimately be bigger than this (output is capped at 64 KB). */
const MAX_LINE_BYTES = 8 * 1024 * 1024;
const PAGE_SIZE = 4096;

let nextId = 1;

function withSep(dir: string): string {
  return dir.endsWith(path.sep) ? dir : dir + path.sep;
}

export function sandboxArgs(
  config: GraderConfig,
  options: { snapshotPath?: string | null; makeSnapshot?: boolean } = {},
): string[] {
  const args = [
    "--permission",
    `--allow-fs-read=${withSep(config.pyodideDir)}`,
    `--allow-fs-read=${withSep(config.sandboxDir)}`,
  ];
  if (options.snapshotPath)
    args.push(`--allow-fs-read=${options.snapshotPath}`);
  args.push(
    "--disallow-code-generation-from-strings",
    `--max-old-space-size=${config.jsHeapMb}`,
    "--no-addons",
    "--disable-sigusr1",
    "--no-experimental-fetch",
    "--no-experimental-websocket",
    "--no-experimental-global-navigator",
    config.sandboxScript,
    config.pyodideDir,
    String(config.wasmMemoryMb),
  );
  if (options.makeSnapshot) args.push("--make-snapshot");
  else if (options.snapshotPath)
    args.push(`--snapshot=${options.snapshotPath}`);
  return args;
}

export class SandboxProcess {
  readonly id = nextId++;
  readonly spawnedAt = Date.now();
  /** Resolves when Pyodide + harness are loaded; rejects if start-up fails. */
  readonly ready: Promise<void>;
  isReady = false;
  loadMs = 0;
  fromSnapshot = false;
  peakRssBytes = 0;
  deathReason: SandboxFailure | null = null;
  deathMessage = "";

  private readonly child: ChildProcess;
  private buffer = "";
  private stderrTail = "";
  private seq = 0;
  private pending: {
    id: string;
    started: number;
    resolve: (r: SandboxResponse) => void;
    timer: ReturnType<typeof setTimeout>;
  } | null = null;
  private rssTimer: ReturnType<typeof setInterval> | null = null;
  private resolveReady!: () => void;
  private rejectReady!: (e: Error) => void;
  private readyTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private readonly config: GraderConfig,
    snapshotPath: string | null = null,
  ) {
    this.ready = new Promise<void>((resolve, reject) => {
      this.resolveReady = resolve;
      this.rejectReady = reject;
    });
    // Avoid unhandled rejections when nobody awaits a failed warm process.
    this.ready.catch(() => {});

    this.child = spawn(config.nodePath, sandboxArgs(config, { snapshotPath }), {
      cwd: config.sandboxDir,
      // No inherited variables at all: the sandbox must not see any secret.
      env: {} as NodeJS.ProcessEnv,
      stdio: ["pipe", "pipe", "pipe"],
      windowsHide: true,
    });
    this.child.stdout?.setEncoding("utf8");
    this.child.stdout?.on("data", (chunk: string) => this.onData(chunk));
    this.child.stderr?.setEncoding("utf8");
    this.child.stderr?.on("data", (chunk: string) => {
      this.stderrTail = (this.stderrTail + chunk).slice(-4000);
    });
    this.child.stdin?.on("error", () => {});
    this.child.on("error", (err) => this.markDead("startup", err.message));
    this.child.on("exit", (code, signal) => {
      this.markDead(
        this.deathReason ?? "exit",
        `exit code ${code ?? "-"} signal ${signal ?? "-"}`,
      );
    });

    this.write({ t: "init", harness: HARNESS_PY, filename: HARNESS_FILENAME });
    this.readyTimer = setTimeout(() => {
      if (!this.isReady) this.kill("startup", "start-up timeout");
    }, config.startupTimeoutMs);
    this.startRssWatch(500);
  }

  get pid(): number | undefined {
    return this.child.pid;
  }

  get alive(): boolean {
    return this.deathReason === null;
  }

  /** Last lines the child wrote to stderr (diagnostics only). */
  get stderr(): string {
    return this.stderrTail;
  }

  /** Resident memory of the child in bytes (Linux; 0 elsewhere). */
  rssBytes(): number {
    const pid = this.child.pid;
    if (!pid || process.platform !== "linux") return 0;
    try {
      const statm = fs.readFileSync(`/proc/${pid}/statm`, "utf8");
      return Number(statm.split(" ")[1]) * PAGE_SIZE;
    } catch {
      return 0;
    }
  }

  private startRssWatch(intervalMs: number): void {
    if (process.platform !== "linux") return;
    if (this.rssTimer) clearInterval(this.rssTimer);
    const limit = this.config.memoryLimitMb * 1024 * 1024;
    this.rssTimer = setInterval(() => {
      const rss = this.rssBytes();
      if (rss > this.peakRssBytes) this.peakRssBytes = rss;
      if (rss > limit)
        this.kill("memory", `RSS ${Math.round(rss / 1048576)} MB > limit`);
    }, intervalMs);
    this.rssTimer.unref?.();
  }

  private write(obj: unknown): void {
    try {
      this.child.stdin?.write(`${JSON.stringify(obj)}\n`);
    } catch {
      // the exit handler reports the failure
    }
  }

  private onData(chunk: string): void {
    this.buffer += chunk;
    if (this.buffer.length > MAX_LINE_BYTES && !this.buffer.includes("\n")) {
      this.kill("protocol", "line too long");
      return;
    }
    let nl = this.buffer.indexOf("\n");
    while (nl >= 0) {
      const line = this.buffer.slice(0, nl);
      this.buffer = this.buffer.slice(nl + 1);
      if (line.length > MAX_LINE_BYTES) {
        this.kill("protocol", "line too long");
        return;
      }
      this.onLine(line);
      nl = this.buffer.indexOf("\n");
    }
  }

  private onLine(line: string): void {
    let msg: SandboxMessage;
    try {
      const parsed: unknown = JSON.parse(line);
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        typeof (parsed as { t?: unknown }).t !== "string"
      )
        return;
      msg = parsed as SandboxMessage;
    } catch {
      return; // ignore garbage
    }
    if (msg.t === "ready" && !this.isReady) {
      this.isReady = true;
      this.fromSnapshot = msg.fromSnapshot === true;
      this.loadMs =
        typeof msg.loadMs === "number"
          ? msg.loadMs
          : Date.now() - this.spawnedAt;
      if (this.readyTimer) clearTimeout(this.readyTimer);
      this.resolveReady();
      return;
    }
    const p = this.pending;
    if (!p || msg.id !== p.id) return;
    if (msg.t === "fatal") {
      this.settle({
        ok: false,
        failure: "fatal",
        message: typeof msg.message === "string" ? msg.message : "fatal",
        durationMs: performance.now() - p.started,
      });
      this.kill("fatal", "interpreter failed");
      return;
    }
    this.settle({
      ok: true,
      message: msg,
      durationMs: performance.now() - p.started,
    });
  }

  private settle(response: SandboxResponse): void {
    const p = this.pending;
    if (!p) return;
    this.pending = null;
    clearTimeout(p.timer);
    this.startRssWatch(500);
    p.resolve(response);
  }

  /** Send one request and wait for its answer (or a failure). */
  request(
    message: Record<string, unknown>,
    timeoutMs: number,
  ): Promise<SandboxResponse> {
    if (!this.alive) {
      return Promise.resolve({
        ok: false,
        failure: this.deathReason ?? "exit",
        message: this.deathMessage,
        durationMs: 0,
      });
    }
    if (this.pending)
      throw new Error("SandboxProcess: request already in flight");
    const id = String(++this.seq);
    return new Promise<SandboxResponse>((resolve) => {
      const started = performance.now();
      const timer = setTimeout(() => {
        this.kill("timeout", `no answer within ${timeoutMs} ms`);
      }, timeoutMs);
      this.pending = { id, started, resolve, timer };
      this.startRssWatch(50);
      this.write({ ...message, id });
    });
  }

  private markDead(reason: SandboxFailure, message: string): void {
    if (this.deathReason === null) {
      this.deathReason = reason;
      this.deathMessage = message;
    }
    if (this.rssTimer) clearInterval(this.rssTimer);
    if (this.readyTimer) clearTimeout(this.readyTimer);
    this.rssTimer = null;
    if (!this.isReady) {
      this.rejectReady(
        new Error(
          `sandbox ${this.id} failed to start (${reason}: ${message}) ${this.stderrTail.slice(-500)}`,
        ),
      );
    }
    const p = this.pending;
    if (p) {
      this.pending = null;
      clearTimeout(p.timer);
      p.resolve({
        ok: false,
        failure: this.deathReason ?? reason,
        message: this.deathMessage || message,
        durationMs: performance.now() - p.started,
      });
    }
  }

  /** SIGKILL the child (idempotent). */
  kill(reason: SandboxFailure = "killed", message = ""): void {
    this.markDead(reason, message);
    try {
      this.child.kill("SIGKILL");
    } catch {
      // already gone
    }
  }
}
