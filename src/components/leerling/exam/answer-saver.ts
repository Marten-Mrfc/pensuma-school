import type { AnswerResponse } from "@/lib/questions/schema";
import { readStorage, removeStorage, storageKey, writeStorage } from "./types";

/**
 * Autosave engine for one attempt (plain class, outside React):
 *  - debounced saves (1.5 s after the last change, at most 10 s apart),
 *  - immediate `flush()` on question switch / tab hide / submit,
 *  - a localStorage backup of every change (restored when newer than the
 *    server copy),
 *  - retries with exponential backoff while offline,
 *  - drops a question the teacher deleted during the attempt (the server
 *    answers "removed"); the other questions keep saving,
 *  - sets aside an answer the server refuses as it is (too long, invalid:
 *    see `isRejectedError`). That is not "offline": the question is marked
 *    as rejected (its local backup stays), the other questions keep saving,
 *    and the next change to it is tried again,
 *  - stops for good when the server says the attempt is closed, and then
 *    removes the local backup (shared school PCs keep nothing behind).
 *
 * React reads `getSnapshot()` through `useSyncExternalStore`.
 */

export type SaveState =
  | "saved"
  | "dirty"
  | "saving"
  | "offline"
  | "locked"
  /** Online, but the server refused at least one answer (see `rejected`). */
  | "error";

export type SaverSnapshot = {
  state: SaveState;
  lastSavedAt: number | null;
  pendingCount: number;
  /**
   * Questions whose latest answer the server refused (too long, invalid).
   * Those answers are not saved until the student changes them.
   */
  rejected: readonly string[];
};

type SaveFn = (
  questionId: string,
  response: AnswerResponse,
) => Promise<{ status: string }>;

export type BackupEntry = { response: AnswerResponse; updatedAt: number };
export type Backup = Record<string, BackupEntry>;

const DEBOUNCE_MS = 1500;
const MAX_WAIT_MS = 10_000;
const MAX_RETRY_MS = 30_000;

/** Save status the server sends for a question that no longer exists. */
export const REMOVED_STATUS = "removed";

/**
 * Errors after which nothing of this attempt can be saved any more: it was
 * handed in (PRECONDITION_FAILED), or it is gone or not the student's
 * (NOT_FOUND / FORBIDDEN). A deleted question is not an error (see
 * REMOVED_STATUS).
 */
export function isLockedError(err: unknown): boolean {
  const e = err as { data?: { code?: string } } | null;
  const code = e?.data?.code;
  return (
    code === "PRECONDITION_FAILED" ||
    code === "NOT_FOUND" ||
    code === "FORBIDDEN"
  );
}

/** tRPC codes for a request the server will never accept as it is. */
const REJECTED_CODES = new Set([
  "BAD_REQUEST",
  "PARSE_ERROR",
  "PAYLOAD_TOO_LARGE",
  "UNPROCESSABLE_CONTENT",
]);

/**
 * Errors about this one answer, not about the connection: the server (or a
 * proxy in front of it) refused it as it is, e.g. an open answer over the
 * 20.000-character limit. Retrying the same answer can never succeed, so it
 * must not count as "offline" or hold up the other questions. Rate limits,
 * an expired session and network errors are not in this group: those are
 * retried.
 */
export function isRejectedError(err: unknown): boolean {
  if (isLockedError(err)) return false;
  const e = err as {
    data?: { code?: string; httpStatus?: number };
    meta?: { response?: { status?: number } };
  } | null;
  const code = e?.data?.code;
  if (code && REJECTED_CODES.has(code)) return true;
  // A proxy's "413 Request Entity Too Large" carries no tRPC code.
  const status = e?.data?.httpStatus ?? e?.meta?.response?.status;
  return status === 413;
}

export class AnswerSaver {
  private pending = new Map<
    string,
    { response: AnswerResponse; version: number }
  >();
  private version = 0;
  /** Questions the teacher deleted during the attempt: never saved again. */
  private removed = new Set<string>();
  /** Questions whose latest answer the server refused (with the error). */
  private rejected = new Map<string, unknown>();
  private running = false;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private firstDirtyAt: number | null = null;
  private retryDelay = 0;
  private offline = false;
  private locked = false;
  private waiters: Array<(ok: boolean) => void> = [];
  private listeners = new Set<() => void>();
  private snapshot: SaverSnapshot = {
    state: "saved",
    lastSavedAt: null,
    pendingCount: 0,
    rejected: [],
  };
  private backupKey: string;

  constructor(
    attemptId: string,
    private save: SaveFn,
    private hooks: {
      /** Server time offset (server − client), for comparable backup times. */
      serverOffsetMs: () => number;
      onLocked?: (error: unknown) => void;
      onSaved?: (questionId: string, status: string) => void;
    },
  ) {
    this.backupKey = storageKey(attemptId);
  }

  /* ------------------------------ subscription ----------------------------- */

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.snapshot;

  private emit() {
    const state: SaveState = this.locked
      ? "locked"
      : this.offline
        ? "offline"
        : this.rejected.size
          ? "error"
          : this.running
            ? "saving"
            : this.pending.size
              ? "dirty"
              : "saved";
    const rejected = [...this.rejected.keys()];
    const sameRejected =
      rejected.length === this.snapshot.rejected.length &&
      rejected.every((id, i) => id === this.snapshot.rejected[i]);
    const next: SaverSnapshot = {
      state,
      lastSavedAt: this.snapshot.lastSavedAt,
      pendingCount: this.pending.size,
      rejected: sameRejected ? this.snapshot.rejected : rejected,
    };
    if (
      next.state !== this.snapshot.state ||
      next.pendingCount !== this.snapshot.pendingCount ||
      next.lastSavedAt !== this.snapshot.lastSavedAt ||
      next.rejected !== this.snapshot.rejected
    ) {
      this.snapshot = next;
      for (const l of this.listeners) l();
    }
  }

  /* --------------------------------- backup -------------------------------- */

  readBackup(): Backup {
    return readStorage<Backup>(this.backupKey) ?? {};
  }

  /** Remove the local backup (after handing in, or once the server locked it). */
  clearBackup() {
    removeStorage(this.backupKey);
  }

  private removeFromBackup(questionId: string) {
    const backup = this.readBackup();
    if (!(questionId in backup)) return;
    delete backup[questionId];
    writeStorage(this.backupKey, backup);
  }

  private writeBackup(questionId: string, response: AnswerResponse) {
    const backup = this.readBackup();
    backup[questionId] = {
      response,
      updatedAt: Date.now() + this.hooks.serverOffsetMs(),
    };
    writeStorage(this.backupKey, backup);
  }

  /* --------------------------------- public -------------------------------- */

  get isLocked() {
    return this.locked;
  }

  get hasPending() {
    return this.pending.size > 0 || this.running;
  }

  /** Something is not on the server yet: queued, saving or refused. */
  get hasUnsaved() {
    return this.hasPending || this.rejected.size > 0;
  }

  /** The error the server gave for this question's refused answer. */
  rejectionOf(questionId: string): unknown {
    return this.rejected.get(questionId);
  }

  /** Record a change: backup now, save soon. */
  update(
    questionId: string,
    response: AnswerResponse,
    opts: { backup?: boolean } = {},
  ) {
    if (this.locked || this.removed.has(questionId)) return;
    if (opts.backup !== false) this.writeBackup(questionId, response);
    // A changed answer gets a new chance.
    this.rejected.delete(questionId);
    this.pending.set(questionId, { response, version: ++this.version });
    this.firstDirtyAt ??= Date.now();
    this.schedule();
    this.emit();
  }

  /**
   * Save everything now. Resolves true when nothing is left unsaved (false
   * while offline, locked, or when an answer was refused).
   */
  flush(): Promise<boolean> {
    if (this.locked) return Promise.resolve(false);
    if (!this.pending.size && !this.running)
      return Promise.resolve(this.rejected.size === 0);
    const done = new Promise<boolean>((resolve) => this.waiters.push(resolve));
    this.clearDebounce();
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
    void this.run();
    return done;
  }

  /** Clear timers (pending changes stay queued; `flush()` restarts them). */
  dispose() {
    this.clearDebounce();
    if (this.retryTimer) {
      clearTimeout(this.retryTimer);
      this.retryTimer = null;
    }
  }

  /* -------------------------------- internals ------------------------------- */

  private clearDebounce() {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  private schedule() {
    if (this.offline) return; // the retry timer takes care of it
    this.clearDebounce();
    const waited = this.firstDirtyAt ? Date.now() - this.firstDirtyAt : 0;
    const delay = Math.max(0, Math.min(DEBOUNCE_MS, MAX_WAIT_MS - waited));
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      void this.run();
    }, delay);
  }

  private resolveWaiters(ok: boolean) {
    const waiters = this.waiters;
    this.waiters = [];
    for (const w of waiters) w(ok);
  }

  private async run() {
    if (this.running || this.locked) return;
    this.running = true;
    this.emit();
    let failed = false;
    while (this.pending.size && !this.locked) {
      const [questionId, entry] = this.pending.entries().next().value as [
        string,
        { response: AnswerResponse; version: number },
      ];
      try {
        const res = await this.save(questionId, entry.response);
        if (res.status === REMOVED_STATUS) {
          // Only this question is gone; keep saving the others.
          this.removed.add(questionId);
          this.rejected.delete(questionId);
          this.pending.delete(questionId);
          this.removeFromBackup(questionId);
        } else if (this.pending.get(questionId)?.version === entry.version) {
          this.pending.delete(questionId);
        }
        this.offline = false;
        this.retryDelay = 0;
        this.snapshot = { ...this.snapshot, lastSavedAt: Date.now() };
        this.hooks.onSaved?.(questionId, res.status);
      } catch (err) {
        if (isLockedError(err)) {
          this.locked = true;
          this.pending.clear();
          this.rejected.clear();
          // Nothing can be saved any more: don't leave answers behind.
          this.clearBackup();
          this.hooks.onLocked?.(err);
        } else if (isRejectedError(err)) {
          // The server is reachable but refuses this answer as it is.
          // Set it aside (the local backup keeps it) and save the others;
          // a newer version typed meanwhile is still tried.
          if (this.pending.get(questionId)?.version === entry.version) {
            this.pending.delete(questionId);
            this.rejected.set(questionId, err);
          }
          this.offline = false;
          this.retryDelay = 0;
          this.emit();
          continue;
        } else {
          failed = true;
          this.offline = true;
          this.retryDelay = Math.min(
            MAX_RETRY_MS,
            this.retryDelay ? this.retryDelay * 2 : 1000,
          );
          this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            void this.run();
          }, this.retryDelay);
        }
        break;
      }
    }
    this.running = false;
    if (!this.pending.size) this.firstDirtyAt = null;
    this.emit();
    if (!this.pending.size && !failed && !this.locked)
      this.resolveWaiters(this.rejected.size === 0);
    else if (failed || this.locked) this.resolveWaiters(false);
  }
}
