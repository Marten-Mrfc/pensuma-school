"use client";

import { FlaskConical, RotateCcw } from "lucide-react";
import { useState } from "react";
import { useAnnounce } from "@/components/a11y/live-announcer";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Spinner } from "@/components/ui/spinner";
import { usePythonRunner } from "@/lib/python/use-python-runner";
import type {
  CodeCheck,
  CodeGradingResult,
  CodeTest,
} from "@/lib/questions/schema";
import { cn } from "@/lib/utils";
import { selfTestAnnouncement } from "./announcements";
import { TestResultsList } from "./test-results-list";

export type SelfTestButtonProps = {
  code: string;
  /** The question's tests; hidden tests are skipped (students never get them anyway). */
  tests: CodeTest[];
  checks: CodeCheck[];
  timeLimitMs: number;
  disabled?: boolean;
  onResult?: (result: CodeGradingResult) => void;
  /** Button label. Default "Testen". */
  label?: string;
  className?: string;
};

/**
 * "Testen": runs the visible tests + checks in the browser (same grading
 * logic as the server) and shows the results in a side sheet. Practice only:
 * the server grades again on submit, including hidden tests.
 */
export function SelfTestButton({
  code,
  tests,
  checks,
  timeLimitMs,
  disabled = false,
  onResult,
  label = "Testen",
  className,
}: SelfTestButtonProps) {
  const runner = usePythonRunner();
  const announce = useAnnounce();
  const [open, setOpen] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<CodeGradingResult | null>(null);
  const visibleTests = tests.filter((t) => !t.hidden);
  const nothingToTest = visibleTests.length === 0 && checks.length === 0;

  const runTests = async () => {
    setRunning(true);
    setResult(null);
    try {
      const r = await runner.grade({
        code,
        tests: visibleTests,
        checks,
        timeLimitMs,
      });
      setResult(r);
      announce(
        selfTestAnnouncement(
          r.tests.filter((t) => t.passed).length,
          r.tests.length,
        ),
      );
      onResult?.(r);
    } finally {
      setRunning(false);
    }
  };

  const openAndRun = () => {
    setOpen(true);
    if (!nothingToTest) void runTests();
  };

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        onClick={openAndRun}
        onMouseEnter={runner.preload}
        onFocus={runner.preload}
        disabled={disabled || running}
        className={className}
      >
        {running ? (
          <Spinner
            size="sm"
            className="text-current"
            role="presentation"
            aria-hidden="true"
          />
        ) : (
          <FlaskConical aria-hidden="true" />
        )}
        {label}
      </Button>
      <Sheet
        open={open}
        onOpenChange={(v) => {
          setOpen(v);
          if (!v && running) runner.stop();
        }}
      >
        <SheetContent side="right" className="w-full gap-0 sm:max-w-xl">
          <SheetHeader className="border-b">
            <SheetTitle>Testresultaten</SheetTitle>
            <SheetDescription>
              Je code is getest met de voorbeeldtests van deze opdracht. Bij het
              inleveren wordt je code opnieuw nagekeken, ook met verborgen
              tests.
            </SheetDescription>
          </SheetHeader>
          <div className={cn("flex-1 overflow-y-auto p-4")}>
            {nothingToTest ? (
              <p className="text-muted-foreground text-sm">
                Deze opdracht heeft geen voorbeeldtests.
              </p>
            ) : running || !result ? (
              <output className="text-muted-foreground flex items-center gap-2 py-8 text-sm">
                <Spinner size="sm" role="presentation" aria-hidden="true" />
                {runner.status === "loading"
                  ? "Python wordt geladen… dit duurt alleen de eerste keer even."
                  : "Je code wordt getest…"}
              </output>
            ) : (
              <TestResultsList result={result} headingLevel={3} />
            )}
          </div>
          {!nothingToTest ? (
            <SheetFooter className="border-t">
              <Button
                type="button"
                variant="outline"
                onClick={runTests}
                disabled={running}
              >
                <RotateCcw aria-hidden="true" />
                Opnieuw testen
              </Button>
            </SheetFooter>
          ) : null}
        </SheetContent>
      </Sheet>
    </>
  );
}
