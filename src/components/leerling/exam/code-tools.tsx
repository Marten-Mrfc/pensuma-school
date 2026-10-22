"use client";

import { ListChecks } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  CodeRunPanel,
  SelfTestButton,
  TestResultsList,
} from "@/components/python";
import {
  CODE_CONSTRUCT_LABELS,
  type CodeCheck,
  type CodeGradingResult,
  type CodeTest,
} from "@/lib/questions/schema";

/** Imperative handle so Ctrl/Cmd+Enter in the editor can start a run. */
export type RunHandle = { run: () => void };

/**
 * "Uitvoer" tab: the shared CodeRunPanel (interactive input()) plus a
 * run handle for the Ctrl/Cmd+Enter shortcut.
 */
export function CodeRunTab({
  code,
  timeLimitMs,
  disabled,
  onRun,
  onHandle,
  consoleMaxHeight,
}: {
  code: string;
  timeLimitMs: number;
  disabled?: boolean;
  onRun?: () => void;
  onHandle?: (handle: RunHandle | null) => void;
  consoleMaxHeight?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!onHandle) return;
    onHandle({
      run: () => {
        // The panel owns its run state; press its "Uitvoeren" button.
        const button = Array.from(
          ref.current?.querySelectorAll("button") ?? [],
        ).find((b) => b.textContent?.trim() === "Uitvoeren" && !b.disabled);
        button?.click();
      },
    });
    return () => onHandle(null);
  }, [onHandle]);

  return (
    <div ref={ref} className="h-full min-h-0 overflow-y-auto">
      <CodeRunPanel
        code={code}
        timeLimitMs={timeLimitMs}
        disabled={disabled}
        onRun={() => onRun?.()}
        consoleMaxHeight={consoleMaxHeight}
      />
    </div>
  );
}

function TestCard({ test }: { test: CodeTest }) {
  return (
    <li className="flex flex-col gap-2 rounded-lg border bg-card p-3">
      <span className="text-sm font-medium">
        {test.name || (test.kind === "function" ? "Functietest" : "Test")}
      </span>
      {test.kind === "io" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <IoBlock label="Invoer" value={test.stdin} empty="(geen invoer)" />
          <IoBlock
            label="Verwachte uitvoer"
            value={test.expectedOutput}
            empty="(niets)"
          />
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          <IoBlock label="Aanroep" value={test.call} empty="" />
          <IoBlock label="Moet teruggeven" value={test.expected} empty="" />
        </div>
      )}
    </li>
  );
}

function IoBlock({
  label,
  value,
  empty,
}: {
  label: string;
  value: string;
  empty: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1">
      <span className="text-xs text-muted-foreground">{label}</span>
      <pre className="max-h-32 overflow-auto rounded-md border bg-[var(--code-bg)] px-2.5 py-1.5 font-mono text-xs leading-relaxed whitespace-pre-wrap text-[var(--code-fg)]">
        {value || <span className="text-muted-foreground italic">{empty}</span>}
      </pre>
    </div>
  );
}

function checkText(check: CodeCheck): string {
  if (check.message) return check.message;
  const what = CODE_CONSTRUCT_LABELS[check.construct];
  const value = check.value ? ` (${check.value})` : "";
  return check.kind === "requires"
    ? `Gebruik een ${what}${value}.`
    : `Gebruik geen ${what}${value}.`;
}

/**
 * "Testen" tab: the visible example tests, the code requirements and the
 * shared SelfTestButton (browser grading, same logic as the server).
 */
export function CodeTestTab({
  code,
  tests,
  checks,
  timeLimitMs,
  disabled,
  onResult,
}: {
  code: string;
  tests: CodeTest[];
  checks: CodeCheck[];
  timeLimitMs: number;
  disabled?: boolean;
  onResult?: (result: CodeGradingResult) => void;
}) {
  const [last, setLast] = useState<CodeGradingResult | null>(null);
  const visible = tests.filter((t) => !t.hidden);
  return (
    <div className="flex h-full min-h-0 flex-col gap-4 overflow-y-auto">
      <div className="flex flex-wrap items-center gap-3">
        <SelfTestButton
          code={code}
          tests={visible}
          checks={checks}
          timeLimitMs={timeLimitMs}
          disabled={disabled}
          onResult={(r) => {
            setLast(r);
            onResult?.(r);
          }}
          label="Test mijn code"
        />
        <p className="min-w-0 flex-1 text-xs text-muted-foreground">
          Bij het inleveren wordt je code ook met verborgen tests nagekeken.
        </p>
      </div>

      {last ? (
        <section
          className="flex flex-col gap-2"
          aria-label="Laatste testresultaat"
        >
          <h3 className="text-sm font-semibold">Laatste test</h3>
          <TestResultsList result={last} compact />
        </section>
      ) : null}

      {checks.length ? (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Eisen aan je code</h3>
          <ul className="flex flex-col gap-1.5 text-sm">
            {checks.map((c) => (
              <li key={c.id} className="flex items-start gap-2">
                <ListChecks
                  className="mt-0.5 size-4 shrink-0 text-muted-foreground"
                  aria-hidden="true"
                />
                {checkText(c)}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">
          Voorbeeldtests{visible.length ? ` (${visible.length})` : ""}
        </h3>
        {visible.length ? (
          <ul className="flex flex-col gap-2">
            {visible.map((t) => (
              <TestCard key={t.id} test={t} />
            ))}
          </ul>
        ) : (
          <p className="text-sm text-muted-foreground">
            Deze vraag heeft geen voorbeeldtests.
          </p>
        )}
      </section>
    </div>
  );
}
