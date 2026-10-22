"use client";

import { lazy, Suspense, useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";

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
  "aria-label"?: string;
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
    // biome-ignore lint/a11y/useSemanticElements: a live loading region, not form output
    <div
      role="status"
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
    </div>
  );
}

/**
 * Python code editor (CodeMirror 6). Client-only: renders a skeleton on the
 * server and while the editor bundle loads.
 *
 * Keyboard: Tab indents (4 spaces), Shift+Tab dedents; Escape then Tab moves
 * focus out of the editor.
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
