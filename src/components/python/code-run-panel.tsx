"use client";

import { Info, Keyboard, Play, Square } from "lucide-react";
import {
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { Switch } from "@/components/ui/switch";
import type { RunResult, TranscriptSegment } from "@/lib/python/types";
import { usePythonRunner } from "@/lib/python/use-python-runner";
import { cn } from "@/lib/utils";
import { PythonErrorCard } from "./python-error-card";
import { RunConsole } from "./run-console";

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

/**
 * "Uitvoeren" panel: runs `code` in the browser (Pyodide worker) and shows a
 * console. input() is interactive when the browser supports it; otherwise
 * (or when the student prefers) the stdin textarea is used.
 * No editor inside: compose it next to the CodeEditor.
 */
export function CodeRunPanel({
  code,
  defaultStdin = "",
  disabled = false,
  timeLimitMs = 5_000,
  onRun,
  className,
  consoleMaxHeight = "20rem",
}: CodeRunPanelProps) {
  const runner = usePythonRunner({ preload: !disabled });
  const [segments, setSegments] = useState<TranscriptSegment[]>([]);
  const [running, setRunning] = useState(false);
  const [inputPrompt, setInputPrompt] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);
  const [stdin, setStdin] = useState(defaultStdin);
  const [useStdinBox, setUseStdinBox] = useState(defaultStdin !== "");
  const resolveInput = useRef<((value: string | null) => void) | null>(null);
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

  const start = async () => {
    if (running || disabled) return;
    setSegments([]);
    setResult(null);
    setRunning(true);
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
                  resolveInput.current = resolve;
                  setInputPrompt(prompt);
                })
            : undefined,
      });
      // Show the full transcript (incl. prompts and the stdin lines that were
      // used), exactly like the server sees it.
      pending.current = [];
      flushPending();
      if (r.segments) setSegments(r.segments);
      setResult(r);
      onRun?.(r);
    } finally {
      resolveInput.current = null;
      setInputPrompt(null);
      setRunning(false);
    }
  };

  const stop = () => {
    resolveInput.current?.(null);
    resolveInput.current = null;
    runner.stop();
  };

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
        <Spinner size="sm" /> Python wordt geladen…
      </span>
    );
  } else if (running && inputPrompt !== null) {
    status = <span className="text-info">Wacht op invoer…</span>;
  } else if (running) {
    status = (
      <span className="text-muted-foreground inline-flex items-center gap-1.5">
        <Spinner size="sm" /> Bezig…
      </span>
    );
  } else if (result) {
    status = result.timedOut ? (
      <span className="text-warning">Tijdslimiet bereikt</span>
    ) : result.error ? (
      <span className="text-destructive">
        {result.error.type === "Stopped" ? "Gestopt" : "Gestopt met een fout"}
      </span>
    ) : (
      <span className="text-success">
        Klaar in {formatSeconds(result.durationMs)}
      </span>
    );
  }

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="flex flex-wrap items-center gap-2">
        {running ? (
          <Button key="stop" type="button" variant="outline" onClick={stop}>
            <Square className="fill-current" aria-hidden="true" />
            Stoppen
          </Button>
        ) : (
          <Button key="run" type="button" onClick={start} disabled={disabled}>
            <Play className="fill-current" aria-hidden="true" />
            Uitvoeren
          </Button>
        )}
        {!running && loading ? (
          <span className="text-muted-foreground inline-flex items-center gap-1.5 text-sm">
            <Spinner size="sm" /> Python wordt geladen…
          </span>
        ) : null}
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
            Invoer – één regel per input()
          </label>
          {!interactive ? (
            <p className="text-muted-foreground flex items-start gap-1.5 text-xs">
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
            disabled={running}
            placeholder={"Mark\n16"}
            className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/50 dark:bg-input/30 min-h-[4.5rem] w-full resize-y rounded-md border px-3 py-2 font-mono text-sm shadow-xs outline-none focus-visible:ring-[3px] disabled:opacity-50"
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
        maxHeight={consoleMaxHeight}
      />

      {result?.error && result.error.type !== "Stopped" ? (
        <PythonErrorCard error={result.error} />
      ) : null}
    </div>
  );
}
