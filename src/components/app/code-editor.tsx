"use client";

import { lazy, type Ref, Suspense, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

/** Imperative handle, e.g. for "Ga naar regel 3" on a Python error. */
export interface CodeEditorHandle {
  /** Move the cursor to the start of a line (1-based), scroll to it and focus. */
  goToLine: (line: number) => void;
  focus: () => void;
}

export interface CodeEditorProps {
  value: string;
  onChange?: (value: string) => void;
  readOnly?: boolean;
  /** CSS length or px number. Default 160. */
  minHeight?: string | number;
  /** CSS length or px number; the editor scrolls beyond it. */
  maxHeight?: string | number;
  autoFocus?: boolean;
  /** Prevent paste and drag-and-drop (exams). `onPaste` still fires. */
  blockPaste?: boolean;
  /** Fires on every paste attempt (blocked or not), e.g. for logging. */
  onPaste?: () => void;
  /** Python autocompletion popup. Default false. */
  autocomplete?: boolean;
  placeholder?: string;
  className?: string;
  /** Accessible name when there is no visible label. Default "Code-editor". */
  "aria-label"?: string;
  /** id of the visible label (e.g. the question heading); wins over aria-label. */
  "aria-labelledby"?: string;
  /** Extra description ids (help or error text); the keyboard hint is added. */
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
  /**
   * How the visible hint says to leave the editor. `escape` (default):
   * "Esc dan Tab". `ctrl-m`: "Ctrl+M dan Tab", for exams in fullscreen, where
   * Escape would also exit fullscreen.
   */
  escapeHint?: "escape" | "ctrl-m";
  /**
   * Imperative handle (React 19: `ref` is a normal prop). Set once the
   * editor bundle has loaded.
   */
  ref?: Ref<CodeEditorHandle>;
}

const CodeEditorView = lazy(() =>
  import("./code-editor-view").then((m) => ({ default: m.CodeEditorView })),
);

const subscribeNoop = () => () => {};

function CodeEditorSkeleton({
  minHeight = 160,
  className,
}: Pick<CodeEditorProps, "minHeight" | "className">) {
  const height = typeof minHeight === "number" ? `${minHeight}px` : minHeight;
  return (
    <output
      aria-label="Editor wordt geladen"
      className={cn(
        "flex overflow-hidden rounded-lg border border-input bg-[var(--code-bg)] shadow-xs",
        className,
      )}
      style={{ minHeight: height }}
    >
      <div className="w-[2.75em] shrink-0 border-r bg-[var(--code-bg)]" />
      <div className="flex flex-1 flex-col gap-2.5 px-3 py-3.5">
        {[46, 68, 32].map((w) => (
          <div
            key={w}
            className="h-3 animate-pulse rounded bg-muted"
            style={{ width: `${w}%` }}
          />
        ))}
      </div>
    </output>
  );
}

/**
 * Python code editor (CodeMirror 6). Client-only: renders a skeleton on the
 * server and while the editor bundle loads.
 *
 * Keyboard: Tab indents (4 spaces), Shift+Tab dedents; Escape then Tab (or
 * Ctrl+M, then Tab) moves focus out of the editor.
 */
export function CodeEditor(props: CodeEditorProps) {
  const mounted = useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
  const skeleton = (
    <CodeEditorSkeleton
      minHeight={props.minHeight}
      className={props.className}
    />
  );
  if (!mounted) return skeleton;
  return (
    <Suspense fallback={skeleton}>
      <CodeEditorView {...props} />
    </Suspense>
  );
}
