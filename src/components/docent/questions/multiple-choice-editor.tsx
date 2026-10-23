"use client";

import {
  Check,
  Eye,
  ListChecks,
  Plus,
  Settings2,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { ReorderButtons } from "@/components/a11y/reorder-buttons";
import { Markdown } from "@/components/app/markdown";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { MultipleChoiceData } from "@/lib/questions/schema";
import { newOption } from "@/lib/questions/templates";
import { optionLetter, type QuestionIssue } from "@/lib/questions/validate";
import { cn } from "@/lib/utils";
import { AutoTextarea, EditorSection, SwitchField } from "./fields";
import { IssueDot, IssueList } from "./issue-list";
import { ChoiceOptionsView } from "./question-preview";

const MAX_OPTIONS = 12;

export function MultipleChoiceEditor({
  data,
  onChange,
  issues,
  prompt,
}: {
  data: MultipleChoiceData;
  onChange: (data: MultipleChoiceData) => void;
  issues: readonly QuestionIssue[];
  prompt: string;
}) {
  const uid = useId();
  const [showAnswers, setShowAnswers] = useState(false);
  const [previewSelected, setPreviewSelected] = useState<string[]>([]);
  const [focusId, setFocusId] = useState<string | null>(null);
  const set = (patch: Partial<MultipleChoiceData>) =>
    onChange({ ...data, ...patch });
  const options = data.options;

  function setOption(
    id: string,
    patch: Partial<MultipleChoiceData["options"][number]>,
  ) {
    set({
      options: options.map((o) => (o.id === id ? { ...o, ...patch } : o)),
    });
  }

  function toggleCorrect(id: string) {
    const option = options.find((o) => o.id === id);
    if (!option) return;
    if (data.multiple || option.correct) {
      setOption(id, { correct: !option.correct });
    } else {
      // One answer: marking this one as correct un-marks the others.
      set({ options: options.map((o) => ({ ...o, correct: o.id === id })) });
    }
  }

  function move(index: number, delta: -1 | 1) {
    const target = index + delta;
    if (target < 0 || target >= options.length) return;
    const next = [...options];
    [next[index], next[target]] = [next[target], next[index]];
    set({ options: next });
  }

  function add() {
    const option = newOption();
    set({ options: [...options, option] });
    setFocusId(option.id);
  }

  const optionIssues = (id: string) =>
    issues.filter(
      (i) =>
        i.target?.field === "option" && "id" in i.target && i.target.id === id,
    );
  const generalIssues = issues.filter((i) => i.target?.field === "options");
  const correctCount = options.filter((o) => o.correct).length;

  return (
    <div className="flex flex-col gap-5">
      <EditorSection
        title="Antwoordopties"
        description={
          data.multiple
            ? "Markeer alle goede antwoorden. Markdown mag, bijvoorbeeld `code`."
            : "Markeer het goede antwoord. Markdown mag, bijvoorbeeld `code`."
        }
        icon={<ListChecks />}
        actions={
          <span className="text-xs text-muted-foreground tabular-nums">
            {correctCount} van {options.length} goed
          </span>
        }
      >
        <IssueList issues={generalIssues} />
        <ol className="flex flex-col gap-2">
          {options.map((option, index) => (
            <OptionRow
              key={option.id}
              itemKey={option.id}
              index={index}
              count={options.length}
              text={option.text}
              correct={option.correct}
              multiple={data.multiple}
              issues={optionIssues(option.id)}
              autoFocus={focusId === option.id}
              onText={(text) => setOption(option.id, { text })}
              onToggle={() => toggleCorrect(option.id)}
              onMove={(d) => move(index, d)}
              onRemove={() =>
                set({ options: options.filter((o) => o.id !== option.id) })
              }
            />
          ))}
        </ol>
        <div>
          <Button
            variant="outline"
            size="sm"
            onClick={add}
            disabled={options.length >= MAX_OPTIONS}
          >
            <Plus aria-hidden="true" />
            Optie toevoegen
          </Button>
        </div>
      </EditorSection>

      <EditorSection title="Instellingen" icon={<Settings2 />}>
        <div className="grid gap-3 sm:grid-cols-2">
          <SwitchField
            label="Meerdere antwoorden toegestaan"
            description="Leerlingen kunnen meer dan één optie aanvinken."
            checked={data.multiple}
            onCheckedChange={(multiple) =>
              set({
                multiple,
                scoring: multiple ? data.scoring : "all_or_nothing",
              })
            }
          />
          <SwitchField
            label="Opties husselen"
            description="Elke leerling ziet de opties in een andere volgorde."
            checked={data.shuffle}
            onCheckedChange={(shuffle) => set({ shuffle })}
          />
        </div>
        <fieldset className="flex flex-col gap-2" disabled={!data.multiple}>
          <legend className="mb-2 text-sm font-medium">Puntentelling</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {(
              [
                [
                  "all_or_nothing",
                  "Alles of niets",
                  "Alleen punten als precies de goede opties gekozen zijn.",
                ],
                [
                  "partial",
                  "Per optie",
                  "Gedeeltelijke punten: elke goed beoordeelde optie levert punten op.",
                ],
              ] as const
            ).map(([value, label, description]) => {
              const active = data.scoring === value;
              return (
                <label
                  key={value}
                  className={cn(
                    "flex cursor-pointer items-start gap-3 rounded-lg border bg-background/60 px-3.5 py-3 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                    active && "border-primary/50 bg-primary/[0.05]",
                    !data.multiple && "cursor-not-allowed opacity-60",
                  )}
                >
                  <input
                    type="radio"
                    name="mc-scoring"
                    value={value}
                    checked={active}
                    onChange={() => set({ scoring: value })}
                    className="mt-1 accent-[var(--primary)]"
                  />
                  <span className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{label}</span>
                    <span className="text-xs leading-relaxed text-muted-foreground">
                      {description}
                    </span>
                  </span>
                </label>
              );
            })}
          </div>
          {!data.multiple ? (
            <p className="text-xs text-muted-foreground">
              Bij één antwoord is het altijd alles of niets.
            </p>
          ) : null}
        </fieldset>
      </EditorSection>

      <EditorSection
        title="Zo ziet de leerling het"
        description="Live voorbeeld. Je kunt het uitproberen; er wordt niets opgeslagen."
        icon={<Eye />}
        actions={
          <div className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
            <Switch
              id={`${uid}-mc-show-answers`}
              size="sm"
              checked={showAnswers}
              onCheckedChange={setShowAnswers}
            />
            <label htmlFor={`${uid}-mc-show-answers`}>
              Toon goede antwoorden
            </label>
          </div>
        }
      >
        <div className="rounded-xl border bg-background p-4 sm:p-5">
          {prompt.trim() ? (
            <Markdown>{prompt}</Markdown>
          ) : (
            <p className="text-sm text-muted-foreground italic">
              Nog geen opdrachttekst.
            </p>
          )}
          <div className="mt-4">
            <ChoiceOptionsView
              options={options}
              multiple={data.multiple}
              selected={previewSelected}
              onSelectedChange={setPreviewSelected}
              reveal={showAnswers}
            />
          </div>
          {data.shuffle ? (
            <p className="mt-3 text-xs text-muted-foreground">
              Leerlingen zien deze opties in willekeurige volgorde.
            </p>
          ) : null}
        </div>
      </EditorSection>
    </div>
  );
}

function OptionRow({
  index,
  count,
  text,
  correct,
  multiple,
  issues,
  autoFocus,
  onText,
  onToggle,
  onMove,
  onRemove,
  itemKey,
}: {
  index: number;
  count: number;
  itemKey: string;
  text: string;
  correct: boolean;
  multiple: boolean;
  issues: QuestionIssue[];
  autoFocus: boolean;
  onText: (text: string) => void;
  onToggle: () => void;
  onMove: (delta: -1 | 1) => void;
  onRemove: () => void;
}) {
  const letter = optionLetter(index);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (autoFocus) ref.current?.querySelector("textarea")?.focus();
  }, [autoFocus]);

  return (
    <li
      className={cn(
        "grid grid-cols-[minmax(0,1fr)_auto] items-start gap-2 rounded-lg border bg-background/60 p-2.5 transition-colors sm:grid-cols-[auto_minmax(0,1fr)_auto]",
        correct && "border-success/40 bg-success/[0.05]",
      )}
    >
      <div className="flex items-center gap-2 sm:pt-0.5">
        <span className="grid size-7 shrink-0 place-items-center rounded-md bg-muted font-mono text-xs font-semibold text-muted-foreground">
          {letter}
        </span>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              aria-pressed={correct}
              aria-label={`Optie ${letter} is ${correct ? "goed" : "fout"}. Klik om te wisselen.`}
              onClick={onToggle}
              className={cn(
                "inline-flex h-7 items-center gap-1 rounded-full border px-2.5 text-xs font-medium transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                correct
                  ? "border-success/40 bg-success/15 text-success-ink"
                  : "text-muted-foreground hover:border-foreground/30 hover:text-foreground",
              )}
            >
              {correct ? (
                <Check className="size-3.5" aria-hidden="true" />
              ) : (
                <X className="size-3.5" aria-hidden="true" />
              )}
              {correct ? "Goed" : "Fout"}
            </button>
          </TooltipTrigger>
          <TooltipContent>
            {multiple
              ? "Markeer als goed of fout"
              : "Markeer als hét goede antwoord"}
          </TooltipContent>
        </Tooltip>
        <IssueDot issues={issues} className="sm:hidden" />
      </div>
      <div
        ref={ref}
        className="order-last col-span-2 min-w-0 sm:order-none sm:col-span-1"
      >
        <AutoTextarea
          value={text}
          onValueChange={onText}
          minRows={1}
          placeholder={`Antwoord ${letter}`}
          aria-label={`Tekst van optie ${letter}`}
          aria-invalid={issues.some((i) => i.severity === "error") || undefined}
          className="min-h-9 py-1.5"
        />
        <IssueList issues={issues} compact className="mt-1.5" />
      </div>
      <div className="flex items-center justify-end gap-0.5 sm:pt-0.5">
        <ReorderButtons
          index={index}
          count={count}
          itemLabel={`Optie ${letter}`}
          itemKey={itemKey}
          onMove={(from, to) => onMove(to > from ? 1 : -1)}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Optie ${letter} verwijderen`}
          onClick={onRemove}
          className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive"
        >
          <Trash2 className="size-3.5" aria-hidden="true" />
        </Button>
      </div>
    </li>
  );
}
