"use client";

import {
  ArrowDown,
  ArrowUp,
  ChevronRight,
  CircleCheck,
  CircleX,
  Copy,
  EyeOff,
  FlaskConical,
  Loader2,
  Plus,
  SquareFunction,
  Terminal,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/components/app/get-error-message";
import { Button } from "@/components/ui/button";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  type CodeTest,
  type FunctionTest,
  type IoTest,
  OUTPUT_MATCH_MODE_LABELS,
  type OutputMatchMode,
  type TestResult,
} from "@/lib/questions/schema";
import { cloneTest, newFunctionTest, newIoTest } from "@/lib/questions/templates";
import type { QuestionIssue } from "@/lib/questions/validate";
import { cn } from "@/lib/utils";
import { AutoTextarea, FieldLabel, HelpPopover, NumberInput, SwitchField } from "./fields";
import { IssueDot, IssueList } from "./issue-list";
import { MATCH_MODE_HELP, MatchModeHelpContent } from "./match-mode-help";
import { type GeneratedValue, useGenerateExpected } from "./use-generate-expected";

const MATCH_OPTIONS = (Object.keys(OUTPUT_MATCH_MODE_LABELS) as OutputMatchMode[]).map((m) => ({
  value: m,
  label: OUTPUT_MATCH_MODE_LABELS[m],
}));

function firstLine(text: string, max = 40) {
  const line = text.split("\n")[0] ?? "";
  const more = text.includes("\n") ? " …" : "";
  return line.length > max ? `${line.slice(0, max)}…` : `${line}${more}`;
}

/** Auto description of a test (used when it has no name). */
export function testSummary(test: CodeTest): string {
  if (test.kind === "function") {
    return `${test.call || "…"} → ${test.expected || "…"}`;
  }
  const out = test.expectedOutput ? firstLine(test.expectedOutput) : "…";
  if (!test.stdin.trim()) return `Uitvoer: ${out}`;
  return `Invoer: ${firstLine(test.stdin.split("\n").join(", "), 30)} → ${out}`;
}

export interface TestCaseEditorProps {
  tests: CodeTest[];
  onChange: (tests: CodeTest[]) => void;
  solution: string;
  timeLimitMs: number;
  issues: readonly QuestionIssue[];
  /** Results of the last check, when still up to date (by test id). */
  results?: ReadonlyMap<string, TestResult> | null;
}

export function TestCaseEditor({
  tests,
  onChange,
  solution,
  timeLimitMs,
  issues,
  results,
}: TestCaseEditorProps) {
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  const [generating, setGenerating] = useState<Set<string>>(() => new Set());
  const [genErrors, setGenErrors] = useState<Record<string, string>>({});
  const generate = useGenerateExpected();
  const latest = useRef({ tests, onChange });
  useEffect(() => {
    latest.current = { tests, onChange };
  });

  function setTest(id: string, patch: Partial<IoTest> | Partial<FunctionTest>) {
    onChange(tests.map((t) => (t.id === id ? ({ ...t, ...patch } as CodeTest) : t)));
  }

  function add(kind: "io" | "function") {
    const n = tests.length + 1;
    const fnName = /\bdef\s+([A-Za-z_]\w*)\s*\(/.exec(solution)?.[1];
    const test =
      kind === "io"
        ? newIoTest({ name: `Test ${n}` })
        : newFunctionTest({
            name: `Test ${n}`,
            call: fnName ? `${fnName}()` : "functie()",
          });
    onChange([...tests, test]);
    setOpen((s) => new Set(s).add(test.id));
  }

  function duplicate(index: number) {
    const copy = cloneTest(tests[index]);
    copy.name = copy.name ? `${copy.name} (kopie)` : "";
    const next = [...tests];
    next.splice(index + 1, 0, copy);
    onChange(next);
    setOpen((s) => new Set(s).add(copy.id));
  }

  function remove(index: number) {
    const removed = tests[index];
    onChange(tests.filter((_, i) => i !== index));
    toast(`Test ${index + 1} verwijderd`, {
      action: {
        label: "Ongedaan maken",
        onClick: () => {
          // Use the newest list/handler: edits made after deleting are kept.
          const current = latest.current.tests.filter((t) => t.id !== removed.id);
          current.splice(Math.min(index, current.length), 0, removed);
          latest.current.onChange(current);
        },
      },
    });
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= tests.length) return;
    const next = [...tests];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
  }

  function markGenerating(ids: string[], on: boolean) {
    setGenerating((s) => {
      const next = new Set(s);
      for (const id of ids) {
        if (on) next.add(id);
        else next.delete(id);
      }
      return next;
    });
  }

  async function fill(targets: CodeTest[]) {
    if (!solution.trim()) {
      toast.error("Schrijf eerst een modeloplossing.");
      return;
    }
    const ids = targets.map((t) => t.id);
    markGenerating(ids, true);
    try {
      const io = targets.filter((t): t is IoTest => t.kind === "io");
      const fn = targets.filter((t): t is FunctionTest => t.kind === "function");
      const [ioResults, fnResults] = await Promise.all([
        io.length ? generate.forIoTests(solution, io, timeLimitMs) : Promise.resolve([]),
        fn.length ? generate.forFunctionTests(solution, fn, timeLimitMs) : Promise.resolve([]),
      ]);
      const byId = new Map<string, GeneratedValue>();
      io.forEach((t, i) => byId.set(t.id, ioResults[i]));
      fn.forEach((t, i) => byId.set(t.id, fnResults[i]));

      const errors: Record<string, string> = {};
      let filled = 0;
      // The teacher may have edited meanwhile: apply to the newest list.
      const next = latest.current.tests.map((t) => {
        const r = byId.get(t.id);
        if (!r) return t;
        if (!r.ok) {
          errors[t.id] = r.message;
          return t;
        }
        filled++;
        return t.kind === "io" ? { ...t, expectedOutput: r.value } : { ...t, expected: r.value };
      });
      latest.current.onChange(next);
      setGenErrors((prev) => {
        const merged = { ...prev };
        for (const id of ids) delete merged[id];
        return { ...merged, ...errors };
      });
      const failed = Object.keys(errors).length;
      if (failed > 0) {
        toast.error(
          failed === 1
            ? "De modeloplossing gaf een fout bij 1 test. Zie de melding bij de test."
            : `De modeloplossing gaf een fout bij ${failed} tests. Zie de meldingen bij de tests.`,
        );
        setOpen((s) => {
          const n = new Set(s);
          for (const id of Object.keys(errors)) n.add(id);
          return n;
        });
      } else if (filled > 0) {
        toast.success(
          filled === 1 ? "Verwachte uitvoer ingevuld." : `Verwachte uitvoer van ${filled} tests ingevuld.`,
        );
      }
    } catch (error) {
      toast.error(getErrorMessage(error, "Uitvoeren op de server lukte niet."));
    } finally {
      markGenerating(ids, false);
    }
  }

  const testIssues = (id: string) =>
    issues.filter((i) => i.target && "id" in i.target && i.target.field === "test" && i.target.id === id);

  const generalIssues = issues.filter((i) => i.target?.field === "tests");
  const anyGenerating = generating.size > 0;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" onClick={() => add("io")}>
          <Terminal aria-hidden="true" />
          Uitvoertest
        </Button>
        <Button size="sm" variant="outline" onClick={() => add("function")}>
          <SquareFunction aria-hidden="true" />
          Functietest
        </Button>
        <div className="ml-auto">
          <Tooltip>
            <TooltipTrigger asChild>
              <span>
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={tests.length === 0 || !solution.trim() || anyGenerating}
                  onClick={() => void fill(tests)}
                >
                  {anyGenerating ? (
                    <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
                  ) : (
                    <WandSparkles aria-hidden="true" />
                  )}
                  Verwachte uitvoer invullen met modeloplossing
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent className="max-w-xs">
              {solution.trim()
                ? "Voert de modeloplossing uit met de invoer van elke test en vult de verwachte uitvoer (of returnwaarde) in. Controleer het resultaat!"
                : "Schrijf eerst een modeloplossing."}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      <IssueList issues={generalIssues} />

      {tests.length === 0 ? (
        <div className="flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-8 text-center">
          <FlaskConical className="size-6 text-muted-foreground" aria-hidden="true" />
          <p className="text-sm font-medium">Nog geen tests</p>
          <p className="max-w-sm text-xs text-muted-foreground">
            Een <strong>uitvoertest</strong> geeft invoer en vergelijkt wat het programma print. Een{" "}
            <strong>functietest</strong> roept een functie aan en vergelijkt de returnwaarde.
          </p>
        </div>
      ) : (
        <ol className="flex flex-col gap-2.5">
          {tests.map((test, index) => (
            <TestCard
              key={test.id}
              test={test}
              index={index}
              count={tests.length}
              open={open.has(test.id)}
              onOpenChange={(o) =>
                setOpen((s) => {
                  const n = new Set(s);
                  if (o) n.add(test.id);
                  else n.delete(test.id);
                  return n;
                })
              }
              issues={testIssues(test.id)}
              result={results?.get(test.id) ?? null}
              generating={generating.has(test.id)}
              genError={genErrors[test.id] ?? null}
              canGenerate={Boolean(solution.trim())}
              onChange={(patch) => setTest(test.id, patch)}
              onMove={(d) => move(index, d)}
              onDuplicate={() => duplicate(index)}
              onRemove={() => remove(index)}
              onGenerate={() => void fill([test])}
            />
          ))}
        </ol>
      )}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                  TestCard                                  */
/* -------------------------------------------------------------------------- */

interface TestCardProps {
  test: CodeTest;
  index: number;
  count: number;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  issues: QuestionIssue[];
  result: TestResult | null;
  generating: boolean;
  genError: string | null;
  canGenerate: boolean;
  onChange: (patch: Partial<IoTest> | Partial<FunctionTest>) => void;
  onMove: (delta: -1 | 1) => void;
  onDuplicate: () => void;
  onRemove: () => void;
  onGenerate: () => void;
}

function IconAction({
  label,
  onClick,
  disabled,
  children,
  destructive,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  children: React.ReactNode;
  destructive?: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-xs"
          aria-label={label}
          disabled={disabled}
          onClick={onClick}
          className={cn(
            "text-muted-foreground hover:text-foreground",
            destructive && "hover:bg-destructive/10 hover:text-destructive",
          )}
        >
          {children}
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function TestCard({
  test,
  index,
  count,
  open,
  onOpenChange,
  issues,
  result,
  generating,
  genError,
  canGenerate,
  onChange,
  onMove,
  onDuplicate,
  onRemove,
  onGenerate,
}: TestCardProps) {
  const id = useId();
  const KindIcon = test.kind === "io" ? Terminal : SquareFunction;
  const hasError = issues.some((i) => i.severity === "error");

  return (
    <li>
      <Collapsible
        open={open}
        onOpenChange={onOpenChange}
        className={cn(
          "overflow-hidden rounded-lg border bg-background/60 transition-colors",
          open && "bg-card shadow-xs",
          hasError && "border-destructive/40",
        )}
      >
        <div className="flex items-center gap-1 py-1.5 pr-1.5 pl-1">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex min-w-0 flex-1 items-center gap-2.5 rounded-md px-1.5 py-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            >
              <ChevronRight
                className={cn(
                  "size-4 shrink-0 text-muted-foreground transition-transform duration-200",
                  open && "rotate-90",
                )}
                aria-hidden="true"
              />
              <span className="grid size-6 shrink-0 place-items-center rounded-md bg-muted font-mono text-[0.7rem] font-semibold text-muted-foreground tabular-nums">
                {index + 1}
              </span>
              <KindIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">
                  {test.name || <span className="font-normal text-muted-foreground italic">{testSummary(test)}</span>}
                </span>
                {test.name ? (
                  <span className="block truncate font-mono text-[0.7rem] text-muted-foreground">
                    {testSummary(test)}
                  </span>
                ) : null}
              </span>
              <span className="hidden shrink-0 items-center gap-1.5 sm:flex">
                {test.kind === "io" ? (
                  <span className="rounded-full border px-2 py-0.5 text-[0.68rem] text-muted-foreground">
                    {OUTPUT_MATCH_MODE_LABELS[test.match]}
                  </span>
                ) : null}
                {test.weight !== 1 ? (
                  <span className="rounded-full border px-2 py-0.5 text-[0.68rem] text-muted-foreground tabular-nums">
                    ×{test.weight}
                  </span>
                ) : null}
              </span>
              {test.hidden ? (
                <span
                  className="inline-flex shrink-0 items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[0.68rem] font-medium text-muted-foreground"
                  title="Verborgen voor leerlingen"
                >
                  <EyeOff className="size-3" aria-hidden="true" />
                  <span className="hidden sm:inline">verborgen</span>
                </span>
              ) : null}
              {result ? (
                result.passed ? (
                  <CircleCheck className="size-4 shrink-0 text-success-ink" aria-label="Modeloplossing slaagt" />
                ) : (
                  <CircleX className="size-4 shrink-0 text-destructive-ink" aria-label="Modeloplossing faalt" />
                )
              ) : null}
              <IssueDot issues={issues} />
            </button>
          </CollapsibleTrigger>
          <div className="flex shrink-0 items-center">
            <IconAction label="Omhoog" onClick={() => onMove(-1)} disabled={index === 0}>
              <ArrowUp className="size-3.5" aria-hidden="true" />
            </IconAction>
            <IconAction label="Omlaag" onClick={() => onMove(1)} disabled={index === count - 1}>
              <ArrowDown className="size-3.5" aria-hidden="true" />
            </IconAction>
            <IconAction label="Dupliceren" onClick={onDuplicate}>
              <Copy className="size-3.5" aria-hidden="true" />
            </IconAction>
            <IconAction label="Verwijderen" onClick={onRemove} destructive>
              <Trash2 className="size-3.5" aria-hidden="true" />
            </IconAction>
          </div>
        </div>

        <CollapsibleContent>
          <div className="flex flex-col gap-4 border-t px-3.5 py-4 sm:px-4">
            <IssueList issues={issues} />
            {genError ? (
              <div
                role="alert"
                className="rounded-md border border-destructive/30 bg-destructive/[0.06] px-3 py-2 text-[0.8rem]"
              >
                <p className="font-medium text-destructive-ink">De modeloplossing gaf een fout bij deze test</p>
                <pre className="mt-1 font-mono text-[0.75rem] whitespace-pre-wrap text-foreground/90">{genError}</pre>
              </div>
            ) : null}
            {result && !result.passed ? <ResultMismatch result={result} /> : null}

            <div className="grid gap-4 sm:grid-cols-[1fr_8rem]">
              <div className="flex flex-col gap-2">
                <FieldLabel htmlFor={`${id}-name`}>Naam</FieldLabel>
                <Input
                  id={`${id}-name`}
                  value={test.name}
                  placeholder={testSummary(test)}
                  onChange={(e) => onChange({ name: e.target.value })}
                  maxLength={120}
                />
                <p className="text-xs text-muted-foreground">
                  Leerlingen zien deze naam bij hun testresultaat
                  {test.hidden ? " (bij verborgen tests alleen “Verborgen test”)" : ""}.
                </p>
              </div>
              <div className="flex flex-col gap-2">
                <FieldLabel htmlFor={`${id}-weight`}>Gewicht</FieldLabel>
                <NumberInput
                  id={`${id}-weight`}
                  value={test.weight}
                  min={0.1}
                  max={100}
                  step={1}
                  onChange={(v) => v !== undefined && onChange({ weight: v })}
                />
              </div>
            </div>

            {test.kind === "io" ? (
              <IoFields
                id={id}
                test={test}
                onChange={onChange}
                generating={generating}
                canGenerate={canGenerate}
                onGenerate={onGenerate}
              />
            ) : (
              <FunctionFields
                id={id}
                test={test}
                onChange={onChange}
                generating={generating}
                canGenerate={canGenerate}
                onGenerate={onGenerate}
              />
            )}

            <SwitchField
              label="Verborgen"
              description="Leerlingen zien deze test niet (invoer en verwachte uitvoer blijven geheim). Hij telt wel mee voor het cijfer."
              checked={test.hidden}
              onCheckedChange={(hidden) => onChange({ hidden })}
            />
          </div>
        </CollapsibleContent>
      </Collapsible>
    </li>
  );
}

function GenerateButton({
  generating,
  canGenerate,
  onGenerate,
  label,
}: {
  generating: boolean;
  canGenerate: boolean;
  onGenerate: () => void;
  label: string;
}) {
  return (
    <Button
      variant="ghost"
      size="xs"
      className="text-primary hover:text-primary"
      disabled={generating || !canGenerate}
      onClick={onGenerate}
      title={canGenerate ? undefined : "Schrijf eerst een modeloplossing"}
    >
      {generating ? (
        <Loader2 className="size-3.5 motion-safe:animate-spin" aria-hidden="true" />
      ) : (
        <WandSparkles className="size-3.5" aria-hidden="true" />
      )}
      {label}
    </Button>
  );
}

function IoFields({
  id,
  test,
  onChange,
  generating,
  canGenerate,
  onGenerate,
}: {
  id: string;
  test: IoTest;
  onChange: (patch: Partial<IoTest>) => void;
  generating: boolean;
  canGenerate: boolean;
  onGenerate: () => void;
}) {
  const inputLines = test.stdin === "" ? 0 : test.stdin.split("\n").length;
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <FieldLabel
            htmlFor={`${id}-stdin`}
            extra={
              <span className="text-xs text-muted-foreground tabular-nums">
                {inputLines === 0 ? "geen invoer" : `${inputLines}× input()`}
              </span>
            }
          >
            Invoer
          </FieldLabel>
          <AutoTextarea
            id={`${id}-stdin`}
            mono
            minRows={3}
            value={test.stdin}
            onValueChange={(stdin) => onChange({ stdin })}
            placeholder={"Mark\n15"}
            aria-describedby={`${id}-stdin-help`}
          />
          <p id={`${id}-stdin-help`} className="text-xs text-muted-foreground">
            Eén regel per <code className="font-mono">input()</code>. Laat leeg als het programma niets vraagt.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <FieldLabel
            htmlFor={`${id}-expected`}
            extra={
              <GenerateButton
                generating={generating}
                canGenerate={canGenerate}
                onGenerate={onGenerate}
                label="Invullen"
              />
            }
          >
            {test.match === "regex" ? "Reguliere expressie" : "Verwachte uitvoer"}
          </FieldLabel>
          <AutoTextarea
            id={`${id}-expected`}
            mono
            minRows={3}
            value={test.expectedOutput}
            onValueChange={(expectedOutput) => onChange({ expectedOutput })}
            placeholder={test.match === "regex" ? "^Hallo \\w+$" : "Hallo Mark"}
            aria-describedby={`${id}-expected-help`}
          />
          <p id={`${id}-expected-help`} className="text-xs text-muted-foreground">
            Wat het programma moet printen. Vragen uit <code className="font-mono">input("…")</code> horen hier
            niet bij.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <FieldLabel
          htmlFor={`${id}-match`}
          extra={
            <HelpPopover label="Uitleg over vergelijken">
              <MatchModeHelpContent current={test.match} />
            </HelpPopover>
          }
        >
          Vergelijking
        </FieldLabel>
        <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_1fr] sm:items-start">
          <NativeSelect
            id={`${id}-match`}
            value={test.match}
            options={MATCH_OPTIONS}
            onChange={(e) => onChange({ match: e.target.value as OutputMatchMode })}
          />
          <p className="text-xs leading-relaxed text-muted-foreground sm:pt-1">
            {MATCH_MODE_HELP[test.match].summary}
          </p>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <SwitchField
          label="Hoofdletters negeren"
          description={test.match === "numbers" ? "Niet van toepassing: alleen getallen tellen." : "“hallo” telt als “Hallo”."}
          checked={test.ignoreCase}
          disabled={test.match === "numbers"}
          onCheckedChange={(ignoreCase) => onChange({ ignoreCase })}
        />
        {test.match === "numbers" ? (
          <div className="flex flex-col gap-2 rounded-lg border bg-background/60 px-3.5 py-3">
            <FieldLabel htmlFor={`${id}-tol`}>Tolerantie</FieldLabel>
            <NumberInput
              id={`${id}-tol`}
              value={test.tolerance}
              min={0}
              max={1_000_000}
              step={0.01}
              onChange={(v) => v !== undefined && onChange({ tolerance: v })}
            />
            <p className="text-xs text-muted-foreground">
              Maximaal verschil per getal, bijv. 0.01 zodat 3.333 en 3.33 allebei goed zijn.
            </p>
          </div>
        ) : null}
      </div>
    </>
  );
}

function FunctionFields({
  id,
  test,
  onChange,
  generating,
  canGenerate,
  onGenerate,
}: {
  id: string;
  test: FunctionTest;
  onChange: (patch: Partial<FunctionTest>) => void;
  generating: boolean;
  canGenerate: boolean;
  onGenerate: () => void;
}) {
  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="flex flex-col gap-2">
          <FieldLabel htmlFor={`${id}-call`}>Aanroep</FieldLabel>
          <Input
            id={`${id}-call`}
            value={test.call}
            onChange={(e) => onChange({ call: e.target.value })}
            placeholder="gemiddelde([1, 2, 3])"
            className="font-mono"
            spellCheck={false}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Een Python-expressie. De code van de leerling wordt eerst uitgevoerd (zonder invoer), daarna deze
            aanroep.
          </p>
        </div>
        <div className="flex flex-col gap-2">
          <FieldLabel
            htmlFor={`${id}-expected`}
            extra={
              <GenerateButton
                generating={generating}
                canGenerate={canGenerate}
                onGenerate={onGenerate}
                label="Invullen"
              />
            }
          >
            Verwachte waarde
          </FieldLabel>
          <Input
            id={`${id}-expected`}
            value={test.expected}
            onChange={(e) => onChange({ expected: e.target.value })}
            placeholder="2.0"
            className="font-mono"
            spellCheck={false}
            autoComplete="off"
          />
          <p className="text-xs text-muted-foreground">
            Een Python-waarde, bijv. <code className="font-mono">2.0</code>,{" "}
            <code className="font-mono">"Hallo"</code>, <code className="font-mono">[1, 2]</code> of{" "}
            <code className="font-mono">True</code>. Lijsten en dicts worden onderdeel voor onderdeel vergeleken.
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-2 rounded-lg border bg-background/60 px-3.5 py-3">
          <FieldLabel htmlFor={`${id}-tol`}>Tolerantie voor kommagetallen</FieldLabel>
          <NumberInput
            id={`${id}-tol`}
            value={test.tolerance}
            min={0}
            max={1_000_000}
            step={0.000001}
            onChange={(v) => v !== undefined && onChange({ tolerance: v })}
          />
          <p className="text-xs text-muted-foreground">
            Bijv. 0.000001: dan is 0.1 + 0.2 gelijk aan 0.3.
          </p>
        </div>
      </div>
    </>
  );
}

function ResultMismatch({ result }: { result: TestResult }) {
  return (
    <div className="rounded-md border border-destructive/30 bg-destructive/[0.05] px-3 py-2 text-[0.8rem]">
      <p className="font-medium text-destructive-ink">
        De modeloplossing slaagt niet voor deze test{result.feedback ? `: ${result.feedback}` : "."}
      </p>
      {result.error ? (
        <pre className="mt-1 font-mono text-[0.75rem] whitespace-pre-wrap">
          {result.error.type}: {result.error.message}
        </pre>
      ) : result.actual !== undefined ? (
        <div className="mt-1.5 grid gap-1 text-xs sm:grid-cols-[auto_1fr]">
          <span className="text-muted-foreground">Kreeg</span>
          <pre className="font-mono whitespace-pre-wrap">{result.actual || "(niets)"}</pre>
        </div>
      ) : null}
    </div>
  );
}
