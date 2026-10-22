"use client";

import { Eraser, TerminalSquare } from "lucide-react";
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { Button } from "@/components/ui/button";
import type { TranscriptSegment } from "@/lib/python/types";
import { cn } from "@/lib/utils";

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
};

const SEGMENT_CLASS: Record<TranscriptSegment["kind"], string> = {
  stdout: "text-foreground",
  stderr: "text-destructive",
  prompt: "text-info",
  input: "text-primary font-semibold",
};

/** Terminal-style output panel with an inline input line for input(). */
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
}: RunConsoleProps) {
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stickToBottom = useRef(true);
  const [value, setValue] = useState("");
  const waiting = inputPrompt !== null;

  // Auto-scroll while the user is at (or near) the bottom.
  const contentKey = `${segments.length}:${segments[segments.length - 1]?.text.length ?? 0}:${waiting}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when the content changes
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [contentKey]);

  useEffect(() => {
    if (waiting) inputRef.current?.focus({ preventScroll: true });
  }, [waiting]);

  const submit = (line: string | null) => {
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
        ref={bodyRef}
        role="log"
        aria-live="polite"
        aria-label="Uitvoer van je programma"
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current =
            el.scrollHeight - el.scrollTop - el.clientHeight < 24;
        }}
        onClick={() => {
          if (waiting && !window.getSelection()?.toString())
            inputRef.current?.focus();
        }}
        className="overflow-auto px-3 py-2 leading-relaxed break-words whitespace-pre-wrap"
        style={{ maxHeight, minHeight }}
      >
        {segments.length === 0 && !waiting ? (
          <span className="text-muted-foreground font-sans text-sm">
            {placeholder}
          </span>
        ) : (
          segments.map((s, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: segments only grow; index is stable
            <span key={i} data-kind={s.kind} className={SEGMENT_CLASS[s.kind]}>
              {s.text}
            </span>
          ))
        )}
        {waiting ? (
          <span className="inline-flex max-w-full min-w-[12ch] items-baseline">
            <input
              ref={inputRef}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  submit(value);
                } else if (e.key === "d" && e.ctrlKey && value === "") {
                  e.preventDefault();
                  submit(null);
                }
              }}
              aria-label={
                inputPrompt
                  ? `Invoer: ${inputPrompt}`
                  : "Invoer voor je programma"
              }
              autoComplete="off"
              autoCapitalize="off"
              autoCorrect="off"
              spellCheck={false}
              className="text-primary caret-primary min-w-[12ch] flex-1 border-0 bg-transparent p-0 font-mono text-sm font-semibold outline-none"
              style={{ width: `${Math.max(12, value.length + 2)}ch` }}
            />
          </span>
        ) : null}
      </div>
      {waiting ? (
        <div className="bg-info/5 text-muted-foreground border-t px-3 py-1 font-sans text-xs">
          Je programma wacht op invoer. Typ je antwoord en druk op{" "}
          <kbd className="font-mono">Enter</kbd>.
        </div>
      ) : null}
    </div>
  );
}
