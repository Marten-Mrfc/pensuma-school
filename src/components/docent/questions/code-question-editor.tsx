"use client";

import { useMutation } from "@tanstack/react-query";
import {
  CircleCheck,
  CircleDashed,
  CircleX,
  Code2,
  FlaskConical,
  Loader2,
  Monitor,
  RefreshCw,
  Server,
  ShieldCheck,
  Timer,
} from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { CodeEditor } from "@/components/app/code-editor";
import { getErrorMessage } from "@/components/app/get-error-message";
import { Button } from "@/components/ui/button";
import type {
  CodeGradingResult,
  CodeQuestionData,
  TestResult,
} from "@/lib/questions/schema";
import {
  type QuestionIssue,
  type SolutionCheck,
  type SolutionCheckState,
  solutionCheckState,
  solutionFingerprint,
} from "@/lib/questions/validate";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";
import { ChecksEditor } from "./checks-editor";
import { EditorSection, FieldLabel, NumberInput } from "./fields";
import { IssueList } from "./issue-list";
import { CodeRunPanel, TestResultsList, usePythonRunner } from "./python";
import { TestCaseEditor } from "./test-case-editor";

export interface CodeQuestionEditorProps {
  questionId: string;
  data: CodeQuestionData;
  onChange: (data: CodeQuestionData) => void;
  issues: readonly QuestionIssue[];
  solutionCheck: SolutionCheck | null;
  /** Save pending edits now; resolves false when that failed. */
  onFlush: () => Promise<boolean>;
  /** Store a new check result in the builder's cache. */
  onSolutionChecked: (check: SolutionCheck) => void;
}

type LastRun = {
  result: CodeGradingResult;
  hash: string;
  source: "server" | "browser";
};

export function CodeQuestionEditor({
  questionId,
  data,
  onChange,
  issues,
  solutionCheck,
  onFlush,
  onSolutionChecked,
}: CodeQuestionEditorProps) {
  const id = useId();
  const trpc = useTRPC();
  const runner = usePythonRunner();
  const [lastRun, setLastRun] = useState<LastRun | null>(null);
  const [browserChecking, setBrowserChecking] = useState(false);

  const serverCheck = useMutation(
    trpc.question.checkSolution.mutationOptions(),
  );
  const recordCheck = useMutation(
    trpc.question.recordSolutionCheck.mutationOptions(),
  );

  const set = (patch: Partial<CodeQuestionData>) =>
    onChange({ ...data, ...patch });
  const hash = solutionFingerprint(data);
  const fresh = lastRun && lastRun.hash === hash ? lastRun : null;
  const resultsById: Map<string, TestResult> | null = fresh
    ? new Map(fresh.result.tests.map((t) => [t.testId, t]))
    : null;
  const state = solutionCheckState(data, solutionCheck);
  const checking = serverCheck.isPending || browserChecking;
  const canCheck = Boolean(data.solution.trim()) && data.tests.length > 0;

  async function checkOnServer() {
    if (!(await onFlush())) {
      toast.error(
        "De vraag kon niet worden opgeslagen. Los eerst de melding bij het opslaan op.",
      );
      return;
    }
    try {
      const { result, check } = await serverCheck.mutateAsync({
        id: questionId,
      });
      setLastRun({ result, hash: check.hash, source: "server" });
      onSolutionChecked(check);
      if (check.passed) toast.success("Modeloplossing slaagt voor alle tests.");
      else
        toast.error(
          `Modeloplossing slaagt voor ${check.passedTests} van ${check.totalTests} tests.`,
        );
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Controleren op de server lukte niet."),
      );
    }
  }

  async function checkInBrowser() {
    if (!(await onFlush())) {
      toast.error(
        "De vraag kon niet worden opgeslagen. Los eerst de melding bij het opslaan op.",
      );
      return;
    }
    setBrowserChecking(true);
    try {
      const result = await runner.grade({
        code: data.solution,
        tests: data.tests,
        checks: data.checks,
        timeLimitMs: data.timeLimitMs,
      });
      setLastRun({ result, hash, source: "browser" });
      if (result.status === "internal_error") {
        toast.error(
          "Python in je browser werkt op dit moment niet. Gebruik “Vraag controleren” (server).",
        );
        return;
      }
      const passedTests = result.tests.filter((t) => t.passed).length;
      const passed =
        result.tests.length === data.tests.length &&
        passedTests === data.tests.length &&
        result.checks.every((c) => c.passed);
      const recorded = await recordCheck.mutateAsync({
        id: questionId,
        hash,
        passed,
        passedTests,
        totalTests: data.tests.length,
      });
      if (recorded.recorded && recorded.check)
        onSolutionChecked(recorded.check);
      if (passed)
        toast.success(
          "Modeloplossing slaagt voor alle tests (gecontroleerd in je browser).",
        );
      else
        toast.error(
          `Modeloplossing slaagt voor ${passedTests} van ${data.tests.length} tests.`,
        );
    } catch (error) {
      toast.error(
        getErrorMessage(error, "Controleren in de browser lukte niet."),
      );
    } finally {
      setBrowserChecking(false);
    }
  }

  const codeIssues = issues.filter(
    (i) => i.target?.field === "solution" || i.target?.field === "starterCode",
  );
  const testIssues = issues.filter(
    (i) => i.target?.field === "test" || i.target?.field === "tests",
  );

  return (
    <div className="flex flex-col gap-5">
      <EditorSection
        title="Code"
        description="De startcode ziet de leerling in de editor. De modeloplossing krijgen leerlingen nooit te zien."
        icon={<Code2 />}
      >
        <div className="flex flex-col gap-2">
          <FieldLabel htmlFor={`${id}-starter`}>Startcode</FieldLabel>
          <CodeEditor
            aria-label="Startcode"
            value={data.starterCode}
            onChange={(starterCode) => set({ starterCode })}
            minHeight={96}
            maxHeight={360}
            placeholder="# Optioneel: code waarmee de leerling begint"
          />
        </div>
        <div className="flex flex-col gap-2">
          <FieldLabel htmlFor={`${id}-solution`}>Modeloplossing</FieldLabel>
          <CodeEditor
            aria-label="Modeloplossing"
            value={data.solution}
            onChange={(solution) => set({ solution })}
            minHeight={160}
            maxHeight={520}
            autocomplete
            placeholder={
              'naam = input("Hoe heet je? ")\nprint("Hallo " + naam)'
            }
          />
          <IssueList issues={codeIssues} />
        </div>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">
            Modeloplossing uitproberen
          </span>
          <CodeRunPanel
            code={data.solution}
            timeLimitMs={data.timeLimitMs}
            disabled={!data.solution.trim()}
          />
        </div>
      </EditorSection>

      <EditorSection
        title="Tests"
        description={
          'Hiermee wordt de code van de leerling automatisch nagekeken. De tekst in input("…") telt nooit mee.'
        }
        icon={<FlaskConical />}
      >
        <TestCaseEditor
          tests={data.tests}
          onChange={(tests) => set({ tests })}
          solution={data.solution}
          timeLimitMs={data.timeLimitMs}
          issues={testIssues}
          results={resultsById}
        />
        <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2">
            <Timer
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            <label htmlFor={`${id}-time`} className="text-sm font-medium">
              Tijdslimiet per test
            </label>
          </div>
          <div className="flex items-center gap-3">
            <NumberInput
              id={`${id}-time`}
              value={data.timeLimitMs / 1000}
              min={0.5}
              max={30}
              step={0.5}
              suffix="sec"
              className="w-28"
              onChange={(v) =>
                v !== undefined && set({ timeLimitMs: Math.round(v * 1000) })
              }
            />
            <span className="hidden text-xs whitespace-nowrap text-muted-foreground sm:inline">
              0,5 – 30 seconden
            </span>
          </div>
        </div>
      </EditorSection>

      <EditorSection
        title="Vraag controleren"
        description="Voert de modeloplossing uit tegen álle tests (ook de verborgen) en de code-eisen. Zo weet je zeker dat de tests kloppen."
        icon={<ShieldCheck />}
        actions={<CheckStateBadge state={state} check={solutionCheck} />}
      >
        <div className="flex flex-wrap items-center gap-2">
          <Button
            onClick={() => void checkOnServer()}
            disabled={!canCheck || checking}
          >
            {serverCheck.isPending ? (
              <Loader2
                className="motion-safe:animate-spin"
                aria-hidden="true"
              />
            ) : state === "passed" || state === "failed" ? (
              <RefreshCw aria-hidden="true" />
            ) : (
              <Server aria-hidden="true" />
            )}
            Vraag controleren
          </Button>
          <Button
            variant="outline"
            onClick={() => void checkInBrowser()}
            disabled={!canCheck || checking}
          >
            {browserChecking ? (
              <Loader2
                className="motion-safe:animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Monitor aria-hidden="true" />
            )}
            Snel controleren in browser
          </Button>
          {!canCheck ? (
            <span className="text-xs text-muted-foreground">
              Voeg eerst een modeloplossing en minstens één test toe.
            </span>
          ) : null}
        </div>
        {lastRun ? (
          <div className="flex flex-col gap-2">
            <p className="text-xs text-muted-foreground">
              Resultaat van de laatste controle (
              {lastRun.source === "server" ? "server" : "in je browser"})
              {fresh ? "" : " — let op: de vraag is daarna gewijzigd"}
            </p>
            <TestResultsList result={lastRun.result} />
          </div>
        ) : null}
      </EditorSection>

      <EditorSection
        title="Code-eisen"
        description="Optioneel: controleer of de leerling bepaalde onderdelen wel of juist niet gebruikt."
        icon={<ShieldCheck />}
      >
        <ChecksEditor
          checks={data.checks}
          onChange={(checks) => set({ checks })}
        />
      </EditorSection>
    </div>
  );
}

export function CheckStateBadge({
  state,
  check,
  className,
}: {
  state: SolutionCheckState;
  check: SolutionCheck | null;
  className?: string;
}) {
  const base =
    "inline-flex h-7 items-center gap-1.5 rounded-full px-3 text-xs font-medium ring-1 ring-inset whitespace-nowrap";
  switch (state) {
    case "passed":
      return (
        <span
          className={cn(
            base,
            "bg-success/10 text-success-ink ring-success/25",
            className,
          )}
        >
          <CircleCheck className="size-3.5" aria-hidden="true" />
          Modeloplossing slaagt voor alle tests
        </span>
      );
    case "failed":
      return (
        <span
          className={cn(
            base,
            "bg-destructive/10 text-destructive-ink ring-destructive/25",
            className,
          )}
        >
          <CircleX className="size-3.5" aria-hidden="true" />
          Slaagt voor {check?.passedTests ?? 0} van {check?.totalTests ?? 0}{" "}
          tests
        </span>
      );
    case "stale":
      return (
        <span
          className={cn(
            base,
            "bg-warning/12 text-warning-ink ring-warning/30",
            className,
          )}
        >
          <RefreshCw className="size-3.5" aria-hidden="true" />
          Gewijzigd sinds de laatste controle
        </span>
      );
    case "unchecked":
      return (
        <span
          className={cn(
            base,
            "bg-warning/12 text-warning-ink ring-warning/30",
            className,
          )}
        >
          <CircleDashed className="size-3.5" aria-hidden="true" />
          Nog niet gecontroleerd
        </span>
      );
    default:
      return (
        <span
          className={cn(
            base,
            "bg-muted/60 text-muted-foreground ring-border",
            className,
          )}
        >
          <CircleDashed className="size-3.5" aria-hidden="true" />
          Niets om te controleren
        </span>
      );
  }
}
