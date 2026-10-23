"use client";

import {
  useInfiniteQuery,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import {
  ArrowLeft,
  BadgeCheck,
  Library,
  Loader2,
  Plus,
  SearchX,
  Users,
} from "lucide-react";
import { useEffect, useId, useState } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/components/app/get-error-message";
import {
  QUESTION_TYPE_ICONS,
  QUESTION_TYPE_TONE,
} from "@/components/docent/questions/question-icons";
import { StudentQuestionPreview } from "@/components/docent/questions/question-preview";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { QUESTION_TYPE_LABELS } from "@/lib/questions/schema";
import {
  EDIT_WITH_ATTEMPTS_WARNING,
  MAX_QUESTIONS_PER_TEST,
} from "@/lib/questions/validate";
import { cn } from "@/lib/utils";
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import {
  BankFilters,
  type BankFilterValue,
  EMPTY_BANK_FILTERS,
} from "./bank-filters";

type BankItem = RouterOutputs["bank"]["search"]["items"][number];

const PAGE_SIZE = 20;

function formatPoints(points: number) {
  const text = Number.isInteger(points)
    ? String(points)
    : points.toLocaleString("nl-NL", { maximumFractionDigits: 2 });
  return `${text} ${points === 1 ? "punt" : "punten"}`;
}

/** "gemaakt door 46 leerlingen · gem. 72%" */
export function usageLabel(usage: BankItem["usage"]): string {
  if (usage.answers === 0) return "nog niet gemaakt";
  const who = `gemaakt door ${usage.answers} ${usage.answers === 1 ? "leerling" : "leerlingen"}`;
  return usage.avgPercentage == null
    ? who
    : `${who} · gem. ${usage.avgPercentage}%`;
}

function useDebounced<T>(value: T, delay = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

/**
 * "Uit vragenbank…": search questions of all tests and add copies to the
 * test that is being edited.
 */
export function QuestionBankDialog({
  open,
  onOpenChange,
  testId,
  questionCount,
  beforeAdd,
  onAdded,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  testId: string;
  /** Questions the test already has (for the 50-question limit). */
  questionCount: number;
  /** Save pending edits first. */
  beforeAdd?: () => Promise<boolean>;
  onAdded?: (questionIds: string[]) => void;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const id = useId();
  const [filters, setFilters] = useState<BankFilterValue>(EMPTY_BANK_FILTERS);
  const [selected, setSelected] = useState<string[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const query = useDebounced(filters.query.trim());

  const input = {
    query: query || undefined,
    types: filters.types.length ? filters.types : undefined,
    tags: filters.tags.length ? filters.tags : undefined,
    includeArchived: filters.includeArchived || undefined,
    excludeTestId: testId,
    limit: PAGE_SIZE,
  };
  const search = useInfiniteQuery({
    ...trpc.bank.search.infiniteQueryOptions(input, {
      getNextPageParam: (last) => last.nextCursor ?? undefined,
    }),
    enabled: open,
  });
  const tags = useQuery({ ...trpc.bank.tags.queryOptions(), enabled: open });
  const preview = useQuery({
    ...trpc.bank.get.queryOptions({ id: previewId ?? "" }),
    enabled: open && previewId !== null,
  });
  const copy = useMutation(trpc.bank.copyToTest.mutationOptions());

  const items = search.data?.pages.flatMap((p) => p.items) ?? [];
  const room = Math.max(0, MAX_QUESTIONS_PER_TEST - questionCount);
  const tooMany = selected.length > room;
  const byId = new Map(items.map((i) => [i.id, i]));
  const previewItem = previewId ? byId.get(previewId) : undefined;

  function reset() {
    setSelected([]);
    setPreviewId(null);
    setFilters(EMPTY_BANK_FILTERS);
  }

  function toggle(itemId: string, on: boolean) {
    setSelected((list) =>
      on
        ? list.includes(itemId)
          ? list
          : [...list, itemId]
        : list.filter((x) => x !== itemId),
    );
  }

  async function add() {
    if (selected.length === 0 || tooMany) return;
    if (beforeAdd && !(await beforeAdd())) return;
    try {
      const res = await copy.mutateAsync({
        questionIds: selected,
        targetTestId: testId,
      });
      await queryClient.invalidateQueries({ queryKey: trpc.test.pathKey() });
      void queryClient.invalidateQueries({ queryKey: trpc.bank.pathKey() });
      toast.success(
        res.created === 1
          ? "1 vraag toegevoegd"
          : `${res.created} vragen toegevoegd`,
      );
      if (res.hasAttempts) toast.warning(EDIT_WITH_ATTEMPTS_WARNING);
      onAdded?.(res.questionIds);
      reset();
      onOpenChange(false);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  const statusText = search.isPending
    ? "Vragen zoeken…"
    : items.length === 0
      ? "Geen vragen gevonden"
      : `${items.length}${search.hasNextPage ? "+" : ""} ${items.length === 1 ? "vraag" : "vragen"} gevonden`;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="flex h-[min(48rem,calc(100dvh-2rem))] flex-col gap-4 p-4 sm:max-w-6xl sm:p-6">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Library className="size-5 text-primary" aria-hidden="true" />
            Vragenbank
          </DialogTitle>
          <DialogDescription className="text-xs sm:text-sm">
            Zoek vragen uit al je toetsen en voeg ze toe aan deze toets. Je
            krijgt een kopie: de oorspronkelijke vraag verandert niet.
          </DialogDescription>
        </DialogHeader>

        <BankFilters
          value={filters}
          onChange={setFilters}
          availableTags={tags.data ?? []}
        />

        <div className="grid min-h-0 flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          {/* Results */}
          <section
            aria-labelledby={`${id}-results`}
            className={cn(
              "flex min-h-0 flex-col gap-2",
              previewId !== null && "hidden lg:flex",
            )}
          >
            <h3 id={`${id}-results`} className="sr-only">
              Zoekresultaten
            </h3>
            <output className="block text-xs font-medium text-muted-foreground">
              {statusText}
            </output>
            <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-1">
              {search.isPending ? (
                <ul className="flex flex-col gap-2" aria-hidden="true">
                  {[0, 1, 2, 3].map((i) => (
                    <li
                      key={i}
                      className="h-24 rounded-xl border bg-muted/40 motion-safe:animate-pulse"
                    />
                  ))}
                </ul>
              ) : search.isError ? (
                <p className="rounded-lg bg-destructive/[0.07] px-3 py-2 text-sm text-destructive-ink">
                  {getErrorMessage(search.error)}
                </p>
              ) : items.length === 0 ? (
                <div className="flex flex-col items-center gap-2 px-4 py-10 text-center">
                  <SearchX
                    className="size-8 text-muted-foreground"
                    aria-hidden="true"
                  />
                  <p className="font-medium">Geen vragen gevonden</p>
                  <p className="max-w-sm text-sm text-muted-foreground">
                    Probeer een ander zoekwoord of zet een filter uit. Vragen
                    uit deze toets zelf staan hier niet tussen.
                  </p>
                </div>
              ) : (
                <ul className="flex flex-col gap-2">
                  {items.map((item) => (
                    <BankRow
                      key={item.id}
                      item={item}
                      checked={selected.includes(item.id)}
                      previewing={previewId === item.id}
                      onCheckedChange={(on) => toggle(item.id, on)}
                      onPreview={() => setPreviewId(item.id)}
                    />
                  ))}
                </ul>
              )}
              {search.hasNextPage ? (
                <div className="flex justify-center pt-3">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void search.fetchNextPage()}
                    disabled={search.isFetchingNextPage}
                  >
                    {search.isFetchingNextPage ? (
                      <Loader2
                        className="motion-safe:animate-spin"
                        aria-hidden="true"
                      />
                    ) : null}
                    Meer laden
                  </Button>
                </div>
              ) : null}
            </div>
          </section>

          {/* Preview */}
          <section
            aria-labelledby={`${id}-preview`}
            className={cn(
              "min-h-0 flex-col overflow-hidden rounded-xl border bg-muted/30",
              previewId === null ? "hidden lg:flex" : "flex",
            )}
          >
            <div className="flex items-center gap-2 border-b bg-card px-3 py-2">
              {previewId !== null ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="lg:hidden"
                  onClick={() => setPreviewId(null)}
                >
                  <ArrowLeft aria-hidden="true" />
                  Terug
                </Button>
              ) : null}
              <h3
                id={`${id}-preview`}
                className="text-sm font-semibold text-muted-foreground"
              >
                <span className="sm:hidden">Voorbeeld</span>
                <span className="hidden sm:inline">
                  Zo ziet de leerling deze vraag
                </span>
              </h3>
              {previewItem ? (
                <Button
                  size="sm"
                  variant={
                    selected.includes(previewItem.id) ? "outline" : "default"
                  }
                  className="ml-auto"
                  onClick={() =>
                    toggle(previewItem.id, !selected.includes(previewItem.id))
                  }
                >
                  {selected.includes(previewItem.id)
                    ? "Niet selecteren"
                    : "Selecteren"}
                </Button>
              ) : null}
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {previewId === null ? (
                <p className="py-10 text-center text-sm text-muted-foreground">
                  Kies een vraag om te zien hoe leerlingen hem krijgen.
                </p>
              ) : preview.isPending ? (
                <p className="flex items-center justify-center gap-2 py-10 text-sm text-muted-foreground">
                  <Loader2
                    className="size-4 motion-safe:animate-spin"
                    aria-hidden="true"
                  />
                  Vraag laden…
                </p>
              ) : preview.isError ? (
                <p className="text-sm text-destructive-ink">
                  {getErrorMessage(preview.error)}
                </p>
              ) : (
                <div className="flex flex-col gap-4">
                  <p className="text-xs text-muted-foreground">
                    Uit “{preview.data.testTitle}”
                    {preview.data.tags.length > 0
                      ? ` · ${preview.data.tags.join(", ")}`
                      : ""}
                  </p>
                  <StudentQuestionPreview
                    key={preview.data.id}
                    question={preview.data}
                  />
                </div>
              )}
            </div>
          </section>
        </div>

        <DialogFooter className="flex-col-reverse items-stretch gap-2 border-t pt-4 sm:flex-row sm:items-center sm:justify-between">
          <p
            className={cn(
              "text-sm",
              tooMany
                ? "font-medium text-destructive-ink"
                : "text-muted-foreground",
            )}
            aria-live="polite"
          >
            {tooMany
              ? room === 0
                ? `Deze toets heeft al ${MAX_QUESTIONS_PER_TEST} vragen.`
                : `Je kunt nog ${room} ${room === 1 ? "vraag" : "vragen"} toevoegen; je hebt er ${selected.length} gekozen.`
              : selected.length === 0
                ? "Vink de vragen aan die je wilt toevoegen."
                : `${selected.length} ${selected.length === 1 ? "vraag" : "vragen"} gekozen. Ze komen achteraan in de toets, in deze volgorde.`}
          </p>
          <div className="flex gap-2 sm:shrink-0">
            <Button
              variant="outline"
              className="flex-1 sm:flex-none"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
            >
              Annuleren
            </Button>
            <Button
              className="flex-1 sm:flex-none"
              disabled={selected.length === 0 || tooMany || copy.isPending}
              onClick={() => void add()}
            >
              {copy.isPending ? (
                <Loader2
                  className="motion-safe:animate-spin"
                  aria-hidden="true"
                />
              ) : (
                <Plus aria-hidden="true" />
              )}
              {selected.length === 1
                ? "1 vraag toevoegen"
                : `${selected.length} vragen toevoegen`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function BankRow({
  item,
  checked,
  previewing,
  onCheckedChange,
  onPreview,
}: {
  item: BankItem;
  checked: boolean;
  previewing: boolean;
  onCheckedChange: (checked: boolean) => void;
  onPreview: () => void;
}) {
  const Icon = QUESTION_TYPE_ICONS[item.type];
  return (
    <li
      className={cn(
        "flex gap-3 rounded-xl border bg-card p-3 shadow-xs transition-colors",
        checked && "border-primary/60 bg-primary/[0.04] ring-1 ring-primary/25",
        previewing && !checked && "border-foreground/25",
      )}
    >
      <div className="pt-0.5">
        <Checkbox
          checked={checked}
          onCheckedChange={(value) => onCheckedChange(value === true)}
          aria-label={`${item.title} selecteren`}
        />
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex items-start gap-2">
          <span
            className={cn(
              "grid size-6 shrink-0 place-items-center rounded-md",
              QUESTION_TYPE_TONE[item.type],
            )}
            title={QUESTION_TYPE_LABELS[item.type]}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            <span className="sr-only">{QUESTION_TYPE_LABELS[item.type]}</span>
          </span>
          <button
            type="button"
            onClick={onPreview}
            aria-pressed={previewing}
            className="min-w-0 flex-1 rounded text-left text-sm leading-snug font-semibold outline-none hover:text-primary hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {item.title || "Naamloze vraag"}
            <span className="sr-only">: voorbeeld bekijken</span>
          </button>
          <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
            {formatPoints(item.points)}
          </span>
        </div>
        {item.promptExcerpt ? (
          <p className="line-clamp-2 text-xs leading-relaxed text-muted-foreground">
            {item.promptExcerpt}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          <span className="min-w-0 truncate">uit: {item.test.title}</span>
          <span className="inline-flex items-center gap-1">
            <Users className="size-3.5" aria-hidden="true" />
            {usageLabel(item.usage)}
          </span>
          {item.solutionChecked ? (
            <span className="inline-flex items-center gap-1 font-medium text-success-ink">
              <BadgeCheck className="size-3.5" aria-hidden="true" />
              Oplossing gecontroleerd
            </span>
          ) : null}
        </div>
        {item.tags.length > 0 ? (
          <ul className="flex flex-wrap gap-1" aria-label="Onderwerpen">
            {item.tags.map((tag) => (
              <li
                key={tag}
                className="rounded-full bg-secondary px-2 py-0.5 text-[0.7rem] font-medium text-secondary-foreground"
              >
                {tag}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </li>
  );
}
