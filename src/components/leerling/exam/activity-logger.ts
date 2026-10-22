/**
 * Batches attempt events (focus, visibility, fullscreen, paste, runs) and
 * sends them to `portal.logEvents` every few seconds. Plain class so the
 * React tree only has to create and dispose it.
 */

export type ClientEventType =
  | "focus_lost"
  | "focus_gained"
  | "visibility_hidden"
  | "visibility_visible"
  | "fullscreen_enter"
  | "fullscreen_exit"
  | "paste"
  | "copy"
  | "code_run"
  | "self_test";

type QueuedEvent = { type: ClientEventType; at: string; details?: Record<string, unknown> };

type SendFn = (events: QueuedEvent[]) => Promise<unknown>;

const FLUSH_MS = 5000;
const MAX_QUEUE = 300;
const MAX_BATCH = 50;

export class ActivityLogger {
  private queue: QueuedEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private sending = false;
  private stopped = false;

  constructor(private send: SendFn) {}

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), FLUSH_MS);
  }

  log(type: ClientEventType, details?: Record<string, unknown>) {
    if (this.stopped) return;
    this.queue.push({ type, at: new Date().toISOString(), details });
    if (this.queue.length > MAX_QUEUE) this.queue.splice(0, this.queue.length - MAX_QUEUE);
  }

  async flush() {
    if (this.sending || !this.queue.length || this.stopped) return;
    this.sending = true;
    const batch = this.queue.slice(0, MAX_BATCH);
    try {
      await this.send(batch);
      this.queue.splice(0, batch.length);
    } catch (err) {
      const code = (err as { data?: { code?: string } } | null)?.data?.code;
      // Closed / not ours: nothing more to log.
      if (code === "NOT_FOUND" || code === "FORBIDDEN") this.stop();
    } finally {
      this.sending = false;
    }
  }

  stop() {
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
