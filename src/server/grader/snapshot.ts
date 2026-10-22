/**
 * Pyodide memory snapshot for fast sandbox start-up (~0.4 s instead of ~3 s).
 *
 * The snapshot is made ONCE per server process by a dedicated, pristine
 * sandbox child (`sandbox.mjs --make-snapshot`, same lockdown flags) that
 * never runs student code, so it can't be poisoned by a student. It is
 * written read-only to the OS temp folder; sandboxes get `--allow-fs-read`
 * for exactly that file. If anything fails, sandboxes load normally.
 * Disable with GRADER_SNAPSHOT=0.
 */
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import type { GraderConfig } from "./config";
import { sandboxArgs } from "./sandbox-process";

const MAX_SNAPSHOT_BYTES = 256 * 1024 * 1024;

const SNAPSHOT_FILE = /^pensuma-pyodide-(\d+)-[a-z0-9]+\.snap$/;

/** Remove snapshots left behind by server processes that no longer exist. */
function removeStaleSnapshots(dir: string): void {
  let names: string[];
  try {
    names = fs.readdirSync(dir);
  } catch {
    return;
  }
  for (const name of names) {
    const m = SNAPSHOT_FILE.exec(name);
    if (!m) continue;
    const pid = Number(m[1]);
    if (pid === process.pid) continue;
    try {
      process.kill(pid, 0); // still running: keep
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ESRCH") {
        fs.rmSync(path.join(dir, name), { force: true });
      }
    }
  }
}

export async function makeSnapshot(config: GraderConfig): Promise<string> {
  const args = sandboxArgs(config, { makeSnapshot: true });
  const child = spawn(config.nodePath, args, {
    cwd: config.sandboxDir,
    env: {} as NodeJS.ProcessEnv,
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  const chunks: Buffer[] = [];
  let size = 0;
  let buffer = "";
  let stderr = "";
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (d: string) => {
    stderr = (stderr + d).slice(-2000);
  });
  child.stdin?.on("error", () => {});

  const done = new Promise<Buffer>((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error("snapshot timeout"));
    }, config.startupTimeoutMs * 2);
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (d: string) => {
      buffer += d;
      let nl = buffer.indexOf("\n");
      while (nl >= 0) {
        const line = buffer.slice(0, nl);
        buffer = buffer.slice(nl + 1);
        nl = buffer.indexOf("\n");
        let msg: { t?: string; data?: string; size?: number };
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.t === "snapshot-chunk" && typeof msg.data === "string") {
          const b = Buffer.from(msg.data, "base64");
          size += b.length;
          if (size > MAX_SNAPSHOT_BYTES) {
            child.kill("SIGKILL");
            reject(new Error("snapshot too large"));
            return;
          }
          chunks.push(b);
        } else if (msg.t === "snapshot-end") {
          clearTimeout(timer);
          const snap = Buffer.concat(chunks);
          if (snap.length !== msg.size)
            reject(new Error("snapshot size mismatch"));
          else resolve(snap);
        } else if (msg.t === "fatal") {
          clearTimeout(timer);
          reject(new Error(`snapshot maker failed: ${stderr}`));
        }
      }
    });
    child.on("exit", () => {
      clearTimeout(timer);
      reject(new Error(`snapshot maker exited early: ${stderr}`));
    });
  });

  try {
    const snap = await done;
    const dir = fs.realpathSync(os.tmpdir());
    removeStaleSnapshots(dir);
    const file = path.join(
      dir,
      `pensuma-pyodide-${process.pid}-${Date.now().toString(36)}.snap`,
    );
    fs.writeFileSync(file, snap, { mode: 0o444 });
    return file;
  } finally {
    child.kill("SIGKILL");
  }
}
