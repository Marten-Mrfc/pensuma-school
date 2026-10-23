"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookmarkPlus,
  Loader2,
  MessageSquareQuote,
  Search,
  Trash2,
} from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/components/app/get-error-message";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { type RouterOutputs, useTRPC } from "@/trpc/react";

type Snippet = RouterOutputs["feedback"]["list"]["general"][number];

const CHIP_COUNT = 8;
const MAX_SNIPPET_LENGTH = 2000;

function short(text: string, max = 48) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > max ? `${flat.slice(0, max - 1).trimEnd()}…` : flat;
}

/**
 * “Snelle opmerkingen”: the teacher's own reusable comments, question
 * specific first, then general. Clicking one adds it to the feedback.
 */
export function FeedbackSnippets({
  questionId,
  feedback,
  onInsert,
  disabled,
}: {
  /** Snippets of this question are shown first (and can be saved for it). */
  questionId?: string;
  /** Current feedback text: the default text for a new snippet. */
  feedback: string;
  onInsert: (text: string) => void;
  disabled?: boolean;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const id = useId();
  const [moreOpen, setMoreOpen] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState("");
  const [onlyThisQuestion, setOnlyThisQuestion] = useState(true);

  const list = useQuery(
    trpc.feedback.list.queryOptions(questionId ? { questionId } : undefined),
  );
  const invalidate = () =>
    queryClient.invalidateQueries({ queryKey: trpc.feedback.list.pathKey() });
  const used = useMutation(trpc.feedback.used.mutationOptions());
  const create = useMutation(
    trpc.feedback.create.mutationOptions({
      onSuccess: async (res) => {
        await invalidate();
        toast.success(
          res.created
            ? "Snelle opmerking bewaard"
            : "Deze opmerking had je al bewaard",
        );
        setSaveOpen(false);
      },
      onError: (error) => toast.error(getErrorMessage(error)),
    }),
  );
  const remove = useMutation(
    trpc.feedback.delete.mutationOptions({
      onSuccess: () => invalidate(),
      onError: (error) => toast.error(getErrorMessage(error)),
    }),
  );

  const all: Snippet[] = [
    ...(list.data?.forQuestion ?? []),
    ...(list.data?.general ?? []),
  ];
  const chips = all.slice(0, CHIP_COUNT);
  const term = search.trim().toLowerCase();
  const found = term
    ? all.filter((s) => s.text.toLowerCase().includes(term))
    : all;

  function insert(snippet: Snippet) {
    onInsert(snippet.text);
    used.mutate({ id: snippet.id });
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          id={`${id}-label`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"
        >
          <MessageSquareQuote className="size-3.5" aria-hidden="true" />
          Snelle opmerkingen
        </span>
        <Popover
          open={saveOpen}
          onOpenChange={(open) => {
            setSaveOpen(open);
            if (open) {
              setDraft(feedback.trim().slice(0, MAX_SNIPPET_LENGTH));
              setOnlyThisQuestion(Boolean(questionId));
            }
          }}
        >
          <PopoverTrigger asChild>
            <Button type="button" variant="ghost" size="sm" disabled={disabled}>
              <BookmarkPlus aria-hidden="true" />
              Bewaar als snelle opmerking
            </Button>
          </PopoverTrigger>
          <PopoverContent
            align="end"
            className="w-[min(24rem,calc(100vw-2rem))]"
          >
            <form
              className="flex flex-col gap-3"
              onSubmit={(e) => {
                e.preventDefault();
                if (!draft.trim()) return;
                create.mutate({
                  text: draft,
                  questionId:
                    onlyThisQuestion && questionId ? questionId : undefined,
                });
              }}
            >
              <label htmlFor={`${id}-draft`} className="text-sm font-medium">
                Tekst van de opmerking
              </label>
              <textarea
                id={`${id}-draft`}
                value={draft}
                maxLength={MAX_SNIPPET_LENGTH}
                rows={4}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Bijvoorbeeld: Let op: input() geeft altijd tekst terug."
                className="w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm shadow-xs outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring"
              />
              {questionId ? (
                <div className="flex items-center gap-2">
                  <Checkbox
                    id={`${id}-only`}
                    checked={onlyThisQuestion}
                    onCheckedChange={(v) => setOnlyThisQuestion(v === true)}
                  />
                  <label htmlFor={`${id}-only`} className="text-sm">
                    Alleen bij deze vraag
                  </label>
                </div>
              ) : null}
              <div className="flex justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSaveOpen(false)}
                >
                  Annuleren
                </Button>
                <Button
                  type="submit"
                  size="sm"
                  disabled={!draft.trim() || create.isPending}
                >
                  {create.isPending ? (
                    <Loader2
                      className="motion-safe:animate-spin"
                      aria-hidden="true"
                    />
                  ) : null}
                  Bewaren
                </Button>
              </div>
            </form>
          </PopoverContent>
        </Popover>
      </div>

      {list.isPending ? null : chips.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Nog geen snelle opmerkingen. Schrijf feedback en kies “Bewaar als
          snelle opmerking” om hem later met één klik te gebruiken.
        </p>
      ) : (
        <ul
          aria-labelledby={`${id}-label`}
          className="flex flex-wrap items-center gap-1.5"
        >
          {chips.map((snippet) => (
            <li key={snippet.id} className="max-w-full min-w-0">
              <button
                type="button"
                disabled={disabled}
                onClick={() => insert(snippet)}
                title={snippet.text}
                className={cn(
                  "inline-flex h-7 max-w-full items-center rounded-full border px-2.5 text-xs transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50",
                  snippet.questionId
                    ? "border-primary/30 bg-primary/[0.06]"
                    : "bg-background",
                )}
              >
                <span className="truncate">{short(snippet.text)}</span>
                <span className="sr-only">
                  {" "}
                  (toevoegen aan de feedback
                  {snippet.questionId ? ", bij deze vraag" : ""})
                </span>
              </button>
            </li>
          ))}
          <li>
            <Popover open={moreOpen} onOpenChange={setMoreOpen}>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  disabled={disabled}
                  className="inline-flex h-7 items-center rounded-full px-2.5 text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  Meer…
                </button>
              </PopoverTrigger>
              <PopoverContent
                align="start"
                className="flex max-h-[min(26rem,70dvh)] w-[min(26rem,calc(100vw-2rem))] flex-col gap-2 p-3"
              >
                <Input
                  type="search"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Zoek in je opmerkingen…"
                  aria-label="Zoek in je snelle opmerkingen"
                  prefixIcon={
                    <Search
                      className="size-4 text-muted-foreground"
                      aria-hidden="true"
                    />
                  }
                />
                <ul className="-mx-1 flex min-h-0 flex-col gap-0.5 overflow-y-auto px-1">
                  {found.length === 0 ? (
                    <li className="px-2 py-4 text-center text-sm text-muted-foreground">
                      Niets gevonden.
                    </li>
                  ) : (
                    found.map((snippet) => (
                      <li
                        key={snippet.id}
                        className="group flex items-start gap-1 rounded-md hover:bg-accent/60"
                      >
                        <button
                          type="button"
                          onClick={() => {
                            insert(snippet);
                            setMoreOpen(false);
                          }}
                          className="min-w-0 flex-1 rounded-md px-2 py-1.5 text-left text-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <span className="line-clamp-3 whitespace-pre-line">
                            {snippet.text}
                          </span>
                          <span className="mt-0.5 block text-[0.7rem] text-muted-foreground">
                            {snippet.questionId ? "Bij deze vraag" : "Algemeen"}
                            {snippet.useCount > 0
                              ? ` · ${snippet.useCount}× gebruikt`
                              : ""}
                          </span>
                        </button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon-sm"
                          aria-label={`Opmerking verwijderen: ${short(snippet.text, 40)}`}
                          onClick={() => remove.mutate({ id: snippet.id })}
                          className="mt-0.5 text-muted-foreground hover:text-destructive"
                        >
                          <Trash2 aria-hidden="true" />
                        </Button>
                      </li>
                    ))
                  )}
                </ul>
              </PopoverContent>
            </Popover>
          </li>
        </ul>
      )}
    </div>
  );
}
