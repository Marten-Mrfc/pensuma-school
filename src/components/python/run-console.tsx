"use client";

import { Eraser, TerminalSquare } from "lucide-react";
import {
  type ReactNode,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import type { TranscriptSegment } from "@/lib/python/types";
import { cn } from "@/lib/utils";
import { inputLabel } from "./announcements";

export type RunConsoleProps = {
  /** What the program printed, plus prompts and typed input. */
  segments: TranscriptSegment[];
  /**
   * When not null, the program waits for `input()`: an inline input line is
   * shown right after the prompt (which is already in `segments`).
   */
  inputPrompt?: string | null;
  /** Called with the typed line, or `null` for end of input (Ctrl+D). */
  onSubmitInput?: (value: string | null) => void;
  /** Shows a "Wissen" button. */
  onClear?: () => void;
  /** Shown in the header, right side (e.g. status). */
  status?: ReactNode;
  /** Text when there is no output yet. */
  placeholder?: string;
  title?: string;
  /** Max height of the output area (CSS length). Default 20rem. */
  maxHeight?: string;
  minHeight?: string;
  className?: string;
  /** Ref to the scrollable output area (e.g. to move focus back after a run). */
  bodyRef?: React.Ref<HTMLDivElement>;
};

/**
 * Per segment kind: visible styling plus a screen-reader prefix, so the kind
 * of text never depends on colour alone (WCAG 1.4.1).
 */
const SEGMENT_STYLE: Record<
  TranscriptSegment["kind"],
  { className: string; srPrefix?: string; marker?: string }
> = {
  stdout: { className: "text-foreground" },
  stderr: {
    className:
      "text-destructive-ink border-destructive box-decoration-clone border-l-2 pl-1.5",
    srPrefix: "Foutmelding: ",
  },
  prompt: {
    className: "text-info-ink italic",
    srPrefix: "Vraag van je programma: ",
  },
  input: {
    className: "text-primary font-semibold",
    srPrefix: "Jouw invoer: ",
    marker: "› ",
  },
};

function Segment({ segment }: { segment: TranscriptSegment }) {
  const style = SEGMENT_STYLE[segment.kind];
  return (
    <span data-kind={segment.kind} className={style.className}>
      {style.marker ? (
        <span aria-hidden="true" className="select-none">
          {style.marker}
        </span>
      ) : null}
      {style.srPrefix ? (
        <span className="sr-only select-none">{style.srPrefix}</span>
      ) : null}
      {segment.text}
    </span>
  );
}

function setRef<T>(ref: React.Ref<T> | undefined, value: T | null) {
  if (typeof ref === "function") ref(value);
  else if (ref) (ref as React.RefObject<T | null>).current = value;
}

/**
 * Terminal-style output panel with an inline input line for input().
 *
 * The output is a `role="log"` with `aria-live="off"`: a print loop must not
 * flood the screen reader. The panel that owns the run announces one summary
 * when it finishes. The region is focusable so keyboard users can scroll it.
 */
export function RunConsole({
  segments,
  inputPrompt = null,
  onSubmitInput,
  onClear,
  status,
  placeholder = "Klik op Uitvoeren om je programma te starten.",
  title = "Console",
  maxHeight = "20rem",
  minHeight = "8rem",
  className,
  bodyRef: externalBodyRef,
}: RunConsoleProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stickToBottom = useRef(true);
  const [value, setValue] = useState("");
  const waiting = inputPrompt !== null;
  const inputId = useId();
  const hintId = useId();
  const setBodyRef = useCallback(
    (node: HTMLDivElement | null) => {
      bodyRef.current = node;
      setRef(externalBodyRef, node);
    },
    [externalBodyRef],
  );

  // Auto-scroll while the user is at (or near) the bottom.
  const contentKey = `${segments.length}:${segments[segments.length - 1]?.text.length ?? 0}:${waiting}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when the content changes
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [contentKey]);

  // Move focus into the input line as soon as the program asks for input.
  useEffect(() => {
    if (waiting) inputRef.current?.focus();
  }, [waiting]);

  const submit = (line: string | null) => {
    // The input line unmounts after submitting: keep focus inside the console
    // (not on <body>) until the next input() or the end of the run.
    bodyRef.current?.focus({ preventScroll: true });
    onSubmitInput?.(line);
    setValue("");
  };

  return (
    <div
      data-slot="run-console"
      className={cn(
        "bg-card text-card-foreground flex flex-col overflow-hidden rounded-lg border font-mono text-sm shadow-xs",
        className,
      )}
    >
      <div className="bg-muted/60 flex items-center gap-2 border-b px-3 py-1.5">
        <TerminalSquare
          className="text-muted-foreground size-4"
          aria-hidden="true"
        />
        <span className="text-muted-foreground font-sans text-xs font-medium">
          {title}
        </span>
        <div className="ml-auto flex items-center gap-2 font-sans text-xs">
          {status}
          {onClear ? (
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={onClear}
              disabled={segments.length === 0}
              className="text-muted-foreground"
            >
              <Eraser aria-hidden="true" />
              Wissen
            </Button>
          ) : null}
        </div>
      </div>
      {/* biome-ignore lint/a11y/useKeyWithClickEvents: clicking focuses the input; keyboard users tab to it */}
      <div
        ref={setBodyRef}
        role="log"
        aria-live="off"
        aria-label="Uitvoer van je programma"
        // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be reachable by keyboard (WCAG 2.1.1)
        tabIndex={0}
        translate="no"
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        onClick={() => {
          if (waiting && !window.getSelection()?.toString())
            inputRef.current?.focus();
        }}
        className="focus-visible:ring-ring overflow-auto px-3 py-2 leading-relaxed break-words whitespace-pre-wrap outline-none focus-visible:ring-2 focus-visible:ring-inset"
        style={{ maxHeight, minHeight }}
      >
        {segments.length === 0 && !waiting ? (
          <span className="text-muted-foreground font-sans text-sm">
            {placeholder}
          </span>
        ) : (
          segments.map((s, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: segments only grow; index is stable
            <Segment key={i} segment={s} />
          ))
        )}
        {waiting ? (
          <form
            className="inline-flex max-w-full min-w-[12ch] items-baseline"
            onSubmit={(e) => {
              e.preventDefault();
              submit(value);
            }}
          >
            <label htmlFor={inputId} className="sr-only">
              {inputLabel(inputPrompt)}
            </label>
            <span aria-hidden="true" className="text-primary select-none">
              ›{" "}
            </span>
            <input
              ref={inputRef}
              id={inputId}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "d" && e.ctrlKey && value === "") {
                  e.preventDefault();
                  submit(null);
                }
              }}
              aria-describedby={hintId}
              enterKeyHint="send"
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="text-primary caret-primary focus-visible:ring-ring min-w-[12ch] flex-1 rounded-sm border-0 bg-transparent p-0 font-mono text-sm font-semibold outline-none focus-visible:ring-2 focus-visible:ring-offset-1"
              style={{ width: `${Math.max(12, value.length + 2)}ch` }}
            />
          </form>
        ) : null}
      </div>
      {waiting ? (
        <p
          id={hintId}
          className="bg-info/5 text-muted-foreground border-t px-3 py-1 font-sans text-xs"
        >
          Je programma wacht op invoer. Typ je antwoord en druk op{" "}
          <kbd className="font-mono">Enter</kbd>.
        </p>
      ) : null}
    </div>
  );
}
