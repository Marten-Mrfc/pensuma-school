/**
 * Batches attempt events (focus, visibility, fullscreen, paste, runs) and
 * sends them to `portal.logEvents` every few seconds. Plain class so the
 * React tree only has to create and dispose it.
 *
 * Data minimisation (AVG): only events the afname's (effective) settings
 * ask for are queued, and `attachMonitoring` adds no focus or visibility
 * listeners at all when focus logging is off. The server applies the same
 * rules again.
 */
import {
  isEventAllowed,
  type MonitoringEventType,
  type MonitoringSettings,
} from "@/lib/privacy/event-details";

export type ClientEventType = MonitoringEventType;

/** Flat details, as `portal.logEvents` accepts them. */
export type EventDetails = Record<string, string | number | boolean | null>;

export type QueuedEvent = {
  type: ClientEventType;
  at: string;
  details?: EventDetails;
};

type SendFn = (events: QueuedEvent[]) => Promise<unknown>;

const FLUSH_MS = 5000;
const MAX_QUEUE = 300;
/** The server accepts at most 50 events per call. */
export const MAX_BATCH = 50;

export class ActivityLogger {
  private queue: QueuedEvent[] = [];
  private timer: ReturnType<typeof setInterval> | null = null;
  private sending = false;
  private stopped = false;

  constructor(
    private send: SendFn,
    private settings: MonitoringSettings,
  ) {}

  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.flush(), FLUSH_MS);
  }

  /** Queue an event; ignored when the settings don't allow its type. */
  log(type: ClientEventType, details?: EventDetails) {
    if (this.stopped || !isEventAllowed(type, this.settings)) return;
    this.queue.push({ type, at: new Date().toISOString(), details });
    if (this.queue.length > MAX_QUEUE)
      this.queue.splice(0, this.queue.length - MAX_QUEUE);
  }

  /** Events waiting to be sent (tests and debugging). */
  get pending(): readonly QueuedEvent[] {
    return this.queue;
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
      // A batch the server rejects would block every later event: drop it.
      else if (code === "BAD_REQUEST") this.queue.splice(0, batch.length);
    } finally {
      this.sending = false;
    }
  }

  /** Stop the periodic flush (can be started again, e.g. React StrictMode remount). */
  pause() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Permanently stop logging (attempt submitted / not ours). */
  stop() {
    this.stopped = true;
    this.pause();
  }
}

/* -------------------------------------------------------------------------- */
/*                              Browser listeners                             */
/* -------------------------------------------------------------------------- */

type Listenable = Pick<EventTarget, "addEventListener" | "removeEventListener">;

export type MonitoringTargets = {
  window: Listenable;
  document: Listenable & {
    readonly visibilityState: DocumentVisibilityState;
    readonly fullscreenElement: Element | null;
  };
};

/** An Escape press this recent explains a fullscreen exit. */
const ESCAPE_WINDOW_MS = 500;

/**
 * Attach the monitoring listeners the settings ask for and return a
 * cleanup function:
 *  - logFocusEvents: blur/focus, visibility and copy (one "away" episode =
 *    one loss; coming back logs how long it took);
 *  - requireFullscreen: fullscreen enter/exit, with afterEscapeKey when the
 *    exit followed an Escape press.
 * With neither setting on, no listener is added at all.
 */
export function attachMonitoring(
  logger: Pick<ActivityLogger, "log" | "flush">,
  settings: Pick<MonitoringSettings, "logFocusEvents" | "requireFullscreen">,
  targets: MonitoringTargets,
  options: { isFinishing?: () => boolean; now?: () => number } = {},
): () => void {
  const now = options.now ?? Date.now;
  const finishing = options.isFinishing ?? (() => false);
  const cleanups: (() => void)[] = [];
  const listen = (
    target: Listenable,
    type: string,
    listener: (event: Event) => void,
    capture = false,
  ) => {
    target.addEventListener(type, listener, capture);
    cleanups.push(() => target.removeEventListener(type, listener, capture));
  };

  if (settings.logFocusEvents) {
    let awaySince: number | null = null;
    const goAway = (type: "focus_lost" | "visibility_hidden") => {
      if (awaySince != null || finishing()) return;
      awaySince = now();
      logger.log(type);
    };
    const comeBack = (type: "focus_gained" | "visibility_visible") => {
      if (awaySince == null) return;
      const durationMs = Math.max(0, Math.round(now() - awaySince));
      awaySince = null;
      logger.log(type, { durationMs });
    };
    listen(targets.window, "blur", () => goAway("focus_lost"));
    listen(targets.window, "focus", () => comeBack("focus_gained"));
    listen(targets.document, "visibilitychange", () =>
      targets.document.visibilityState === "hidden"
        ? goAway("visibility_hidden")
        : comeBack("visibility_visible"),
    );
    listen(targets.document, "copy", () => logger.log("copy"));
  }

  if (settings.requireFullscreen) {
    let lastEscape = Number.NEGATIVE_INFINITY;
    let wasFullscreen = !!targets.document.fullscreenElement;
    listen(
      targets.window,
      "keydown",
      (event) => {
        if ((event as KeyboardEvent).key === "Escape") lastEscape = now();
      },
      true,
    );
    listen(targets.document, "fullscreenchange", () => {
      const isFullscreen = !!targets.document.fullscreenElement;
      if (isFullscreen === wasFullscreen || finishing()) {
        wasFullscreen = isFullscreen;
        return;
      }
      wasFullscreen = isFullscreen;
      const afterEscapeKey = now() - lastEscape < ESCAPE_WINDOW_MS;
      logger.log(isFullscreen ? "fullscreen_enter" : "fullscreen_exit", {
        afterEscapeKey,
      });
      if (!isFullscreen) void logger.flush();
    });
  }

  return () => {
    for (const cleanup of cleanups.splice(0)) cleanup();
  };
}
