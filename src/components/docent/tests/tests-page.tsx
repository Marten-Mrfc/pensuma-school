"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  CalendarPlus,
  ClipboardList,
  Copy,
  Download,
  Ellipsis,
  ListChecks,
  MessageSquareText,
  Plus,
  Search,
  SquareCode,
  Trash2,
  Upload,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useDeferredValue, useEffect, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { getErrorMessage } from "@/components/app/get-error-message";
import { PageHeader } from "@/components/app/page-header";
import { EmptyBlock, ErrorState, LoadingState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { RelativeTime } from "@/components/ui/relative-time";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import { downloadTestJson } from "./download";
import { ImportTestDialog } from "./import-test-dialog";
import { NewTestDialog } from "./new-test-dialog";
import { formatPoints } from "./question-list";

type TestRow = RouterOutputs["test"]["list"][number];
type StatusFilter = "active" | "draft" | "published" | "archived" | "all";

const FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "active", label: "Actief" },
  { value: "draft", label: "Concept" },
  { value: "published", label: "Gepubliceerd" },
  { value: "archived", label: "Gearchiveerd" },
  { value: "all", label: "Alle" },
];

const FILTER_STORAGE_KEY = "pensuma:toetsen:filter";

/** Strip markdown to a short plain-text excerpt. */
function excerpt(markdown: string, max = 160) {
  const text = markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/[`*_>#[\]()!-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return text.length > max ? `${text.slice(0, max).trimEnd()}…` : text;
}

export function TestsPage() {
  const trpc = useTRPC();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<StatusFilter>("active");
  const deferredSearch = useDeferredValue(search.trim());

  useEffect(() => {
    try {
      const saved = window.localStorage.getItem(FILTER_STORAGE_KEY) as StatusFilter | null;
      if (saved && FILTERS.some((f) => f.value === saved)) setStatus(saved);
    } catch {
      // ignore
    }
  }, []);

  function changeStatus(value: StatusFilter) {
    setStatus(value);
    try {
      window.localStorage.setItem(FILTER_STORAGE_KEY, value);
    } catch {
      // ignore
    }
  }

  const query = useQuery({
    ...trpc.test.list.queryOptions({ search: deferredSearch || undefined, status }),
    placeholderData: (prev) => prev,
  });

  const rows = query.data ?? [];
  const filtering = Boolean(deferredSearch) || status !== "active";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Toetsen"
        description="Bouw toetsen met programmeer-, meerkeuze- en open vragen. Publiceer een toets en plan daarna een afname voor een klas."
        actions={
          <>
            <ImportTestDialog />
            <NewTestDialog />
          </>
        }
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="w-full sm:max-w-xs">
          <Input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek op titel of onderwerp…"
            aria-label="Zoek toetsen"
            prefixIcon={<Search className="size-4 text-muted-foreground" aria-hidden="true" />}
          />
        </div>
        <div
          role="radiogroup"
          aria-label="Filter op status"
          className="flex w-full gap-0.5 overflow-x-auto rounded-lg border bg-muted/50 p-0.5 sm:w-auto"
        >
          {FILTERS.map((f) => (
            // biome-ignore lint/a11y/useSemanticElements: segmented control
            <button
              key={f.value}
              type="button"
              role="radio"
              aria-checked={status === f.value}
              onClick={() => changeStatus(f.value)}
              className={cn(
                "h-8 shrink-0 rounded-md px-3 text-sm font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
                status === f.value && "bg-background text-foreground shadow-xs",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {query.isPending ? (
        <LoadingState variant="list" label="Toetsen laden…" />
      ) : query.isError ? (
        <ErrorState title="De toetsen konden niet worden geladen" error={query.error} onRetry={() => query.refetch()} />
      ) : rows.length === 0 ? (
        filtering ? (
          <EmptyBlock
            icon={Search}
            title="Geen toetsen gevonden"
            description="Probeer een andere zoekterm of een ander filter."
            action={
              <Button
                variant="outline"
                onClick={() => {
                  setSearch("");
                  changeStatus("active");
                }}
              >
                Filters wissen
              </Button>
            }
          />
        ) : (
          <EmptyBlock
            icon={ClipboardList}
            title="Nog geen toetsen"
            description="Maak je eerste toets. Je voegt vragen toe vanuit sjablonen, zoals een invoer-en-uitvoeropdracht of een meerkeuzevraag."
            action={
              <>
                <NewTestDialog
                  trigger={
                    <Button>
                      <Plus aria-hidden="true" />
                      Nieuwe toets
                    </Button>
                  }
                />
                <ImportTestDialog
                  trigger={
                    <Button variant="outline">
                      <Upload aria-hidden="true" />
                      Importeren
                    </Button>
                  }
                />
              </>
            }
          />
        )
      ) : (
        <ul className={cn("grid gap-4 sm:grid-cols-2 xl:grid-cols-3", query.isFetching && "opacity-80")}>
          {rows.map((row) => (
            <TestCard key={row.id} test={row} />
          ))}
        </ul>
      )}
    </div>
  );
}

function TypeCount({ icon: Icon, n, label }: { icon: typeof SquareCode; n: number; label: string }) {
  if (n === 0) return null;
  return (
    <span className="inline-flex items-center gap-1" title={label}>
      <Icon className="size-3.5" aria-hidden="true" />
      <span className="tabular-nums">{n}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}

function TestCard({ test }: { test: TestRow }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const invalidate = () => queryClient.invalidateQueries({ queryKey: trpc.test.pathKey() });

  const duplicate = useMutation(
    trpc.test.duplicate.mutationOptions({
      onSuccess: async (res) => {
        await invalidate();
        toast.success(`Kopie van “${test.title}” gemaakt.`, {
          action: { label: "Openen", onClick: () => router.push(routes.docent.test(res.id)) },
        });
      },
      onError: (e) => toast.error(getErrorMessage(e)),
    }),
  );
  const setStatus = useMutation(
    trpc.test.setStatus.mutationOptions({
      onSuccess: async (res) => {
        await invalidate();
        toast.success(res.status === "archived" ? "Toets gearchiveerd." : "Toets teruggezet als concept.");
      },
      onError: (e) => toast.error(getErrorMessage(e)),
    }),
  );
  const remove = useMutation(trpc.test.delete.mutationOptions());

  async function exportJson() {
    try {
      const data = await queryClient.fetchQuery({
        ...trpc.test.exportJson.queryOptions({ id: test.id }),
        staleTime: 0,
      });
      downloadTestJson(test.title, data);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  const description = excerpt(test.description);
  const href = routes.docent.test(test.id);
  const hasAttempts = test.attemptCount > 0;

  return (
    <li className="group relative flex flex-col rounded-xl border bg-card text-card-foreground shadow-xs transition-[box-shadow,border-color] focus-within:ring-2 focus-within:ring-ring/40 hover:border-primary/30 hover:shadow-md">
      <div className="flex flex-1 flex-col gap-3 p-5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <StatusBadge kind="test" status={test.status} />
            {test.topic ? (
              <span className="truncate rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                {test.topic}
              </span>
            ) : null}
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Acties voor ${test.title}`}
                className="relative z-10 -mr-2 text-muted-foreground"
              >
                <Ellipsis aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem asChild>
                <Link href={href}>Openen</Link>
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => duplicate.mutate({ id: test.id })}>
                <Copy aria-hidden="true" />
                Dupliceren
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => void exportJson()}>
                <Download aria-hidden="true" />
                Exporteren (JSON)
              </DropdownMenuItem>
              {test.status === "archived" ? (
                <DropdownMenuItem onSelect={() => setStatus.mutate({ id: test.id, status: "draft" })}>
                  <ArchiveRestore aria-hidden="true" />
                  Dearchiveren
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onSelect={() => setStatus.mutate({ id: test.id, status: "archived" })}>
                  <Archive aria-hidden="true" />
                  Archiveren
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => setConfirmOpen(true)}
                className="text-destructive focus:text-destructive"
              >
                <Trash2 aria-hidden="true" />
                Verwijderen
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex min-w-0 flex-col gap-1.5">
          <h2 className="text-[1.05rem] leading-snug font-semibold text-balance">
            <Link href={href} className="outline-none after:absolute after:inset-0 after:rounded-xl">
              {test.title}
            </Link>
          </h2>
          {description ? (
            <p className="line-clamp-2 text-sm text-muted-foreground">{description}</p>
          ) : (
            <p className="text-sm text-muted-foreground/70 italic">Geen beschrijving</p>
          )}
        </div>

        <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1.5 pt-1 text-sm">
          <span className="font-medium tabular-nums">
            {test.questionCount} {test.questionCount === 1 ? "vraag" : "vragen"}
          </span>
          <span className="text-muted-foreground tabular-nums">
            {formatPoints(test.totalPoints)} {test.totalPoints === 1 ? "punt" : "punten"}
          </span>
          <span className="flex items-center gap-2.5 text-xs text-muted-foreground">
            <TypeCount icon={SquareCode} n={test.codeCount} label="programmeervragen" />
            <TypeCount icon={ListChecks} n={test.choiceCount} label="meerkeuzevragen" />
            <TypeCount icon={MessageSquareText} n={test.openCount} label="open vragen" />
          </span>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 border-t px-5 py-3">
        <span className="min-w-0 truncate text-xs text-muted-foreground">
          {test.assignmentCount > 0
            ? `${test.assignmentCount} ${test.assignmentCount === 1 ? "afname" : "afnames"} · `
            : ""}
          bewerkt <RelativeTime date={test.updatedAt} locale="nl-NL" formatStyle="short" />
          {test.createdByName ? ` · ${test.createdByName}` : ""}
        </span>
        {test.status === "published" ? (
          <Button asChild size="xs" variant="outline" className="relative z-10 shrink-0">
            <Link href={routes.docent.newAssignment({ testId: test.id })}>
              <CalendarPlus aria-hidden="true" />
              Afname plannen
            </Link>
          </Button>
        ) : test.status === "draft" ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="relative z-10 shrink-0">
                <Button size="xs" variant="outline" disabled>
                  <CalendarPlus aria-hidden="true" />
                  Afname plannen
                </Button>
              </span>
            </TooltipTrigger>
            <TooltipContent>Publiceer de toets eerst.</TooltipContent>
          </Tooltip>
        ) : null}
      </div>

      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        destructive={!hasAttempts}
        title={hasAttempts ? "Archiveren in plaats van verwijderen?" : `“${test.title}” verwijderen?`}
        description={
          hasAttempts
            ? `Deze toets is al ${test.attemptCount} keer gemaakt en kan daarom niet worden verwijderd. Archiveer hem; dan blijven alle resultaten bewaard.`
            : test.assignmentCount > 0
              ? `De toets en ${test.assignmentCount === 1 ? "de afname" : `${test.assignmentCount} afnames`} (zonder pogingen) worden definitief verwijderd.`
              : "De toets en alle vragen worden definitief verwijderd."
        }
        confirmLabel={hasAttempts ? "Archiveren" : "Verwijderen"}
        onConfirm={async () => {
          if (hasAttempts) {
            await setStatus.mutateAsync({ id: test.id, status: "archived" });
            return;
          }
          await remove.mutateAsync({ id: test.id });
          await invalidate();
          toast.success("Toets verwijderd.");
        }}
      />
    </li>
  );
}
