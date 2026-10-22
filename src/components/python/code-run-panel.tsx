"use client";

import { Info, Keyboard, Play, Square } from "lucide-react";
import {
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { useAnnounce } from "@/components/a11y/live-announcer";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type { RunResult, TranscriptSegment } from "@/lib/python/types";
import { usePythonRunner } from "@/lib/python/use-python-runner";
import { cn } from "@/lib/utils";
import { inputAnnouncement, runAnnouncement } from "./announcements";
import { PythonErrorCard } from "./python-error-card";
import { RunConsole } from "./run-console";

/** Imperative handle, e.g. for a Ctrl/Cmd+Enter shortcut in the editor. */
export type CodeRunPanelHandle = {
  /** Start a run (no-op while running or disabled). */
  run: () => void;
  /** Stop the current run (no-op when idle). */
  stop: () => void;
  isRunning: () => boolean;
};

export type CodeRunPanelProps = {
  code: string;
  /** Pre-filled stdin lines (one per input()). */
  defaultStdin?: string;
  disabled?: boolean;
  timeLimitMs?: number;
  onRun?: (result: RunResult) => void;
  className?: string;
  /** Max height of the console output. */
  consoleMaxHeight?: string;
  /**
   * Shows "Ga naar regel {n}" on the error card; move the editor's cursor to
   * that line and focus it.
   */
  onGoToLine?: (line: number) => void;
  /**
   * Imperative handle (React 19: `ref` is a normal prop):
   *   const panel = useRef<CodeRunPanelHandle>(null);
   *   <CodeRunPanel ref={panel} code={code} />
   *   // in the editor's Ctrl/Cmd+Enter handler:
   *   panel.current?.run();
   */
  ref?: React.Ref<CodeRunPanelHandle>;
};

const subscribeNever = () => () => {};

function appendSegment(
  list: TranscriptSegment[],
  s: TranscriptSegment,
): TranscriptSegment[] {
  const last = list[list.length - 1];
  if (last && last.kind === s.kind) {
    return [...list.slice(0, -1), { kind: s.kind, text: last.text + s.text }];
  }
  return [...list, s];
}

function formatSeconds(ms: number): string {
  return `${(ms / 1000).toLocaleString("nl-NL", { maximumFractionDigits: 2, minimumFractionDigits: ms < 10_000 ? 2 : 1 })} s`;
}

/** Decorative spinner next to visible text (no extra live region). */
function InlineSpinner() {
  return <Spinner size="sm" role="presentation" aria-hidden="true" />;
}

/**
 * "Uitvoeren" panel: runs `code` in the browser (Pyodide worker) and shows a
 * console. input() is interactive when the browser supports it; otherwise
 * (or when the student prefers) the stdin textarea is used.
 * No editor inside: compose it next to the CodeEditor.
 *
 * Screen readers hear exactly one polite summary per run ("Klaar in 0,4
 * seconden. 12 regels uitvoer.") plus one message each time the program waits
 * for input(); the console itself is not a live region.
 */
export function CodeRunPanel({
  code,
  defaultStdin = "",
  disabled = false,
  timeLimitMs = 5_000,
  onRun,
  className,
  consoleMaxHeight = "20rem",
  onGoToLine,
  ref,
}: CodeRunPanelProps) {
  const runner = usePythonRunner({ preload: !disabled });
  const announce = useAnnounce();
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [running, setRunning] = useState(false);
  const [inputPrompt, setInputPrompt] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [stdin, setStdin] = useState(defaultStdin);
  const [useStdinBox, setUseStdinBox] = useState(defaultStdin !== "");
  const resolveInput = useRef<((value: string | null) => void) | null>(null);
  const runButtonRef = useRef<HTMLButtonElement>(null);
  const consoleBodyRef = useRef<HTMLDivElement>(null);
  // Output arrives per print(); render at most once per animation frame.
  const pending = useRef<TranscriptSegment[]>([]);
  const frame = useRef<number | null>(null);
  const flushPending = () => {
    if (frame.current !== null) cancelAnimationFrame(frame.current);
    frame.current = null;
    const batch = pending.current;
    pending.current = [];
    if (batch.length) setSegments((prev) => batch.reduce(appendSegment, prev));
  };
  const queueSegment = (s: TranscriptSegment) => {
    pending.current.push(s);
    frame.current ??= requestAnimationFrame(flushPending);
  };
  const stdinId = useId();
  const stdinHelpId = useId();
  const switchId = useId();

  // Only decide about the fallback after hydration (the server can't know
  // whether this browser is cross-origin isolated), so nothing flashes.
  const isClient = useSyncExternalStore(
    subscribeNever,
    () => true,
    () => false,
  );
  const interactive = runner.interactive;
  const showStdin = useStdinBox || (isClient && !interactive);

  // Unblock a pending input() when the panel unmounts.
  useEffect(
    () => () => {
      resolveInput.current?.(null);
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  /** After a run with interactive input, give focus back to the run button. */
  const restoreFocus = () => {
    const active = document.activeElement;
    const lost =
      !active ||
      active === document.body ||
      (consoleBodyRef.current?.contains(active) ?? false);
    if (lost) runButtonRef.current?.focus();
  };

  const start = async () => {
    if (running || disabled) return;
    setSegments([]);
    setResult(null);
    setRunning(true);
    let askedForInput = false;
    try {
      const r = await runner.run({
        code,
        stdin: showStdin ? stdin : "",
        timeLimitMs,
        onSegment: queueSegment,
        onInput:
          interactive && !useStdinBox
            ? (prompt) =>
                new Promise<string | null>((resolve) => {
                  flushPending(); // show everything printed before the prompt
                  askedForInput = true;
                  resolveInput.current = resolve;
                  setInputPrompt(prompt);
                  announce(inputAnnouncement(prompt));
                })
            : undefined,
      });
      // Show the full transcript (incl. prompts and the stdin lines that were
      // used), exactly like the server sees it.
      pending.current = [];
      flushPending();
      if (r.segments) setSegments(r.segments);
      setResult(r);
      announce(runAnnouncement(r, timeLimitMs));
      onRun?.(r);
    } finally {
      resolveInput.current = null;
      setInputPrompt(null);
      setRunning(false);
      // After React has removed the input line (which held the focus).
      if (askedForInput) setTimeout(restoreFocus, 50);
    }
  };

  const stop = () => {
    resolveInput.current?.(null);
    resolveInput.current = null;
    runner.stop();
  };

  useImperativeHandle(ref, () => ({
    run: () => void start(),
    stop: () => {
      if (running) stop();
    },
    isRunning: () => running,
  }));

  const submitInput = (value: string | null) => {
    const resolve = resolveInput.current;
    resolveInput.current = null;
    setInputPrompt(null);
    resolve?.(value);
  };

  const loading = runner.status === "loading";
  let status: React.ReactNode = null;
  if (running && loading) {
    status = (
      <span className="text-muted-foreground inline-flex items-center gap-1.5">
        <InlineSpinner /> Python laden…
      </span>
    );
  } else if (running && inputPrompt !== null) {
    status = <span className="text-info-ink">Wacht op invoer…</span>;
  } else if (running) {
    status = (
      <span className="text-muted-foreground inline-flex items-center gap-1.5">
        <InlineSpinner /> Bezig…
      </span>
    );
  } else if (result) {
    status = result.timedOut ? (
      <span className="text-warning-ink">Tijdslimiet bereikt</span>
    ) : result.error ? (
      <span className="text-destructive-ink">
        {result.error.type === "Stopped" ? "Gestopt" : "Gestopt met een fout"}
      </span>
    ) : (
      <span className="text-success-ink">
        Klaar in {formatSeconds(result.durationMs)}
      </span>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          ref={runButtonRef}
          type="button"
          variant={running ? "outline" : "default"}
          onClick={running ? stop : start}
          disabled={!running && disabled}
          aria-busy={running}
        >
          {running ? (
            <Square className="fill-current" aria-hidden="true" />
          ) : (
            <Play className="fill-current" aria-hidden="true" />
          )}
          {running ? "Stoppen" : "Uitvoeren"}
        </Button>
        <output className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
          {loading ? (
            <>
              <InlineSpinner />
              Python wordt geladen… dit duurt alleen de eerste keer even.
            </>
          ) : null}
        </output>
        {interactive ? (
          <label
            htmlFor={switchId}
            className="text-muted-foreground ml-auto inline-flex cursor-pointer items-center gap-2 text-sm"
          >
            <Keyboard className="size-4" aria-hidden="true" />
            Invoer vooraf invullen
            <Switch
              id={switchId}
              checked={useStdinBox}
              onCheckedChange={(v: boolean) => setUseStdinBox(v)}
              disabled={running}
            />
          </label>
        ) : null}
      </div>

      {runner.loadError ? (
        <Alert variant="destructive">
          <AlertDescription>{runner.loadError}</AlertDescription>
        </Alert>
      ) : null}

      {showStdin ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={stdinId} className="text-sm font-medium">
            Invoer voor input() (één regel per keer dat input() wordt
            aangeroepen)
          </label>
          {!interactive ? (
            <p
              id={stdinHelpId}
              className="text-muted-foreground flex items-start gap-1.5 text-xs"
            >
              <Info className="mt-px size-3.5 shrink-0" aria-hidden="true" />
              In deze browser kun je niet tijdens het uitvoeren typen. Vul hier
              vooraf de invoer in: elke regel is het antwoord op één input().
            </p>
          ) : null}
          <textarea
            id={stdinId}
            value={stdin}
            onChange={(e) => setStdin(e.target.value)}
            rows={3}
            spellCheck={false}
            autoComplete="off"
            translate="no"
            disabled={running}
            placeholder={"Mark\n16"}
            aria-describedby={!interactive ? stdinHelpId : undefined}
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring dark:bg-input/30 min-h-[4.5rem] w-full resize-y rounded-md border px-3 py-2 font-mono text-sm shadow-xs outline-none focus-visible:ring-[3px] disabled:opacity-50"
          />
        </div>
      ) : null}

      <RunConsole
        segments={segments}
        inputPrompt={inputPrompt}
        onSubmitInput={submitInput}
        onClear={
          running
            ? undefined
            : () => {
                setSegments([]);
                setResult(null);
              }
        }
        status={status}
        placeholder={
          result && !running ? "Je programma printte niets." : undefined
        }
        maxHeight={consoleMaxHeight}
        bodyRef={consoleBodyRef}
      />

      {result?.error && result.error.type !== "Stopped" ? (
        <PythonErrorCard
          error={result.error}
          announce={false}
          onGoToLine={onGoToLine}
        />
      ) : null}
    </div>
  );
}
