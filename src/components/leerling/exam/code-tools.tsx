"use client";

import type { CodeCheck, CodeGradingResult, CodeTest } from "@/lib/questions/schema";

/** Imperative handle so Ctrl/Cmd+Enter in the editor can start a run. */
export type RunHandle = { run: () => void };

export function CodeRunTab(_props: {
  code: string;
  timeLimitMs: number;
  disabled?: boolean;
  onRun?: () => void;
  onHandle?: (handle: RunHandle | null) => void;
}) {
  return <p className="text-sm text-muted-foreground">Python wordt geladen…</p>;
}

export function CodeTestTab(_props: {
  code: string;
  tests: CodeTest[];
  checks: CodeCheck[];
  timeLimitMs: number;
  disabled?: boolean;
  onResult?: (result: CodeGradingResult) => void;
}) {
  return <p className="text-sm text-muted-foreground">Python wordt geladen…</p>;
}
