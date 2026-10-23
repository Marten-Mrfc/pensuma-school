"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  AlarmClockPlus,
  Clock,
  Eye,
  Loader2,
  MonitorX,
  MoreHorizontal,
  RotateCcw,
  Search,
  Trash2,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useAnnounce } from "@/components/a11y/live-announcer";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { getErrorMessage } from "@/components/app/get-error-message";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { RelativeTime } from "@/components/ui/relative-time";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { computeGrade, type GradingScale } from "@/lib/grading/grade-scale";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import { focusInvalidField } from "../a11y/invalid-field-focus";
import { useResultAnnouncement } from "../a11y/result-announcement";
import { formatGrade, formatNumber, formatRemaining } from "./format";
import {
  MINUTES_ERROR,
  MinutesField,
  parseExtraMinutes,
} from "./minutes-field";
import { useDialogReturnFocus } from "./use-dialog-return-focus";

type Monitor = RouterOutputs["assignment"]["monitor"];
type StudentRow = Monitor["students"][number];
type Filter = "all" | "in_progress" | "submitted" | "not_started" | "focus";

/** Seconds without a heartbeat before a busy student counts as "inactive". */
const INACTIVE_MS = 90_000;

function rowState(row: StudentRow) {
  if (!row.attempt) return "not_started" as const;
  return row.attempt.status;
}

/** Status message after searching or filtering the live overview. */
export function selectionMessage(count: number): string {
  if (count === 0) return "Geen leerlingen in deze selectie.";
  return count === 1
    ? "1 leerling in deze selectie."
    : `${count} leerlingen in deze selectie.`;
}

/** Help text for the focus-loss column. */
export const FOCUS_LOSS_HELP =
  "Voorleessoftware, dicteerfuncties en vergrotingsprogramma's kunnen dit ook veroorzaken.";

export function MonitorTable({
  assignmentId,
  data,
  now,
  serverOffsetMs,
  scale,
  logFocusEvents = true,
  resultsWaitForEveryone = false,
}: {
  assignmentId: string;
  data: Monitor;
  /** Local clock, ticking every second. */
  now: number;
  serverOffsetMs: number;
  /** The afname's grading scale (from assignment.get settings). */
  scale?: GradingScale;
  logFocusEvents?: boolean;
  /**
   * Results show "after close" and are not released by hand: they wait
   * until nobody is working any more (also a reopened attempt).
   */
  resultsWaitForEveryone?: boolean;
}) {
  const headingId = useId();
  const [filter, setFilter] = useState<Filter>("all");
  const [search, setSearch] = useState("");
  const [dialog, setDialog] = useState<
    | { kind: "extend"; row: StudentRow }
    | { kind: "reopen"; row: StudentRow }
    | { kind: "reset"; row: StudentRow }
    | null
  >(null);
  const serverNow = now + serverOffsetMs;

  const counts: Record<Filter, number> = {
    all: data.students.length,
    in_progress: data.summary.inProgress,
    submitted: data.summary.submitted,
    not_started: data.summary.notStarted,
    focus: data.summary.focusWarnings,
  };
  const q = search.trim().toLowerCase();
  const rows = data.students.filter((r) => {
    if (
      q &&
      !r.student.name.toLowerCase().includes(q) &&
      !(r.student.studentNumber ?? "").includes(q)
    )
      return false;
    switch (filter) {
      case "all":
        return true;
      case "focus":
        return (r.attempt?.focusLossCount ?? 0) > 0;
      default:
        return rowState(r) === filter;
    }
  });

  // Read the size of the selection aloud after a search or filter change
  // (not on every poll: the key only changes when the teacher acts).
  useResultAnnouncement({
    key: `${q}|${filter}`,
    ready: true,
    message: selectionMessage(rows.length),
    delayMs: 400,
  });

  const filters: { value: Filter; label: string }[] = [
    { value: "all", label: "Iedereen" },
    { value: "in_progress", label: "Bezig" },
    { value: "submitted", label: "Ingeleverd" },
    { value: "not_started", label: "Niet begonnen" },
    { value: "focus", label: "Vensterwissels" },
  ];

  return (
    <section className="flex flex-col gap-3" aria-labelledby={headingId}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <h2 id={headingId} className="sr-only">
          Leerlingen
        </h2>
        <div className="flex flex-wrap gap-1.5">
          {filters.map((f) => (
            <button
              key={f.value}
              type="button"
              aria-pressed={filter === f.value}
              onClick={() => setFilter(f.value)}
              className={cn(
                "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-sm font-medium whitespace-nowrap transition-colors outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring",
                filter === f.value &&
                  "border-primary bg-primary/10 text-primary hover:bg-primary/15",
              )}
            >
              {f.label}
              <span
                className={cn(
                  "text-xs tabular-nums",
                  filter === f.value ? "text-primary" : "text-muted-foreground",
                )}
              >
                {counts[f.value]}
              </span>
            </button>
          ))}
          {data.summary.withAccommodation > 0 ? (
            <span className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full bg-info/10 px-3 text-sm font-medium whitespace-nowrap text-info-ink">
              <Clock className="size-3.5" aria-hidden="true" />
              {data.summary.withAccommodation} met verlengde tijd
            </span>
          ) : null}
        </div>
        <div className="md:w-64">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Zoek leerling…"
            aria-label="Zoek leerling"
            prefixIcon={<Search className="size-4" />}
          />
        </div>
      </div>

      {rows.length === 0 ? (
        <p className="rounded-xl border border-dashed bg-card/50 px-4 py-10 text-center text-sm text-muted-foreground">
          Geen leerlingen in deze selectie.
        </p>
      ) : (
        <>
          {/* Desktop: table */}
          <div className="hidden overflow-hidden rounded-xl border bg-card shadow-xs md:block">
            <table className="w-full text-sm">
              <thead className="bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Leerling
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Status
                  </th>
                  <th scope="col" className="w-[18%] px-3 py-2.5 font-medium">
                    Voortgang
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Tijd over
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2.5 text-center font-medium"
                  >
                    Vensterwissels
                  </th>
                  <th scope="col" className="px-3 py-2.5 font-medium">
                    Laatst actief
                  </th>
                  <th
                    scope="col"
                    className="px-3 py-2.5 text-right font-medium"
                  >
                    Score
                  </th>
                  <th scope="col" className="w-12 px-2 py-2.5">
                    <span className="sr-only">Acties</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {rows.map((row) => (
                  <tr
                    key={row.student.id}
                    className={cn(
                      "transition-colors hover:bg-muted/30",
                      !row.attempt && "text-muted-foreground",
                    )}
                  >
                    <td className="px-4 py-3">
                      <StudentCell row={row} />
                    </td>
                    <td className="px-3 py-3">
                      <StatusPill row={row} serverNow={serverNow} />
                    </td>
                    <td className="px-3 py-3">
                      <ProgressCell row={row} />
                    </td>
                    <td className="px-3 py-3">
                      <RemainingCell row={row} serverNow={serverNow} />
                    </td>
                    <td className="px-3 py-3 text-center">
                      <FocusCell row={row} />
                    </td>
                    <td className="px-3 py-3">
                      <LastSeenCell row={row} serverNow={serverNow} />
                    </td>
                    <td className="px-3 py-3 text-right">
                      <ScoreCell row={row} scale={scale} />
                    </td>
                    <td className="px-2 py-3 text-right">
                      <RowActions
                        assignmentId={assignmentId}
                        row={row}
                        onDialog={setDialog}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Phone: cards */}
          <ul className="flex flex-col gap-2 md:hidden">
            {rows.map((row) => (
              <li
                key={row.student.id}
                className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs"
              >
                <div className="flex items-start justify-between gap-3">
                  <StudentCell row={row} />
                  <div className="flex items-center gap-1">
                    <StatusPill row={row} serverNow={serverNow} />
                    <RowActions
                      assignmentId={assignmentId}
                      row={row}
                      onDialog={setDialog}
                    />
                  </div>
                </div>
                {row.attempt ? (
                  <>
                    <ProgressCell row={row} />
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div className="flex flex-col gap-0.5">
                        <span className="text-muted-foreground">Tijd over</span>
                        <RemainingCell row={row} serverNow={serverNow} />
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-muted-foreground">
                          Vensterwissels
                        </span>
                        <FocusCell row={row} />
                      </div>
                      <div className="flex flex-col gap-0.5 text-right">
                        <span className="text-muted-foreground">Score</span>
                        <ScoreCell row={row} scale={scale} />
                      </div>
                    </div>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
          {logFocusEvents ? (
            <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
              <MonitorX
                className="mt-0.5 size-3.5 shrink-0"
                aria-hidden="true"
              />
              <span>
                Vensterwissels: het aantal keer dat een leerling het
                toetsvenster verliet. {FOCUS_LOSS_HELP}
              </span>
            </p>
          ) : null}
        </>
      )}

      <ExtendTimeDialog
        row={dialog?.kind === "extend" ? dialog.row : null}
        onClose={() => setDialog(null)}
      />
      <ReopenAttemptDialog
        row={dialog?.kind === "reopen" ? dialog.row : null}
        defaultMinutes={
          (data.assignment.timeLimitMinutes ?? 15) +
          (dialog?.kind === "reopen"
            ? (dialog.row.attempt?.accommodationMinutes ?? 0)
            : 0)
        }
        assignmentClosed={data.assignment.effectiveStatus === "closed"}
        resultsWaitForEveryone={resultsWaitForEveryone}
        onClose={() => setDialog(null)}
      />
      <ResetAttemptDialog
        row={dialog?.kind === "reset" ? dialog.row : null}
        onClose={() => setDialog(null)}
      />
    </section>
  );
}

/* --------------------------------- Cells ---------------------------------- */

function StudentCell({ row }: { row: StudentRow }) {
  return (
    <div className="flex min-w-0 items-center gap-3">
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full text-xs font-semibold",
          row.attempt
            ? "bg-primary/10 text-primary"
            : "bg-muted text-muted-foreground",
        )}
        aria-hidden="true"
      >
        {initials(row.student.name)}
      </span>
      <div className="flex min-w-0 flex-col">
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="truncate font-medium text-foreground">
            {row.student.name}
          </span>
          {row.extraTimePercent > 0 ? (
            <ExtraTimeBadge percent={row.extraTimePercent} />
          ) : null}
        </span>
        <span className="text-xs text-muted-foreground tabular-nums">
          {row.student.studentNumber ?? "–"}
          {!row.student.inClass ? " · niet meer in de klas" : ""}
          {row.attemptCount > 1
            ? ` · poging ${row.attempt?.attemptNumber}`
            : ""}
        </span>
      </div>
    </div>
  );
}

/** "+25%" with a clock; the tooltip explains it is a facility. */
function ExtraTimeBadge({ percent }: { percent: number }) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="inline-flex h-5 shrink-0 cursor-default items-center gap-0.5 rounded-full bg-info/10 px-1.5 text-[11px] font-semibold text-info-ink tabular-nums outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
        >
          <Clock className="size-3" aria-hidden="true" />+{percent}%
          <span className="sr-only"> verlengde tijd (faciliteit)</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>Verlengde tijd (faciliteit)</TooltipContent>
    </Tooltip>
  );
}

function StatusPill({
  row,
  serverNow,
}: {
  row: StudentRow;
  serverNow: number;
}) {
  const a = row.attempt;
  let label = "Niet begonnen";
  let cls = "bg-muted/60 text-muted-foreground ring-border/70";
  let dot = "bg-muted-foreground/40";
  let pulse = false;
  if (a?.status === "in_progress") {
    const inactive =
      a.lastSeenAt &&
      serverNow - new Date(a.lastSeenAt).getTime() > INACTIVE_MS;
    label = inactive ? "Bezig · inactief" : "Bezig";
    cls = "bg-warning/12 text-warning-ink ring-warning/30";
    dot = "bg-warning";
    pulse = !inactive;
  } else if (a?.status === "submitted") {
    label = a.autoSubmitted ? "Ingeleverd (auto)" : "Ingeleverd";
    cls = "bg-success/10 text-success-ink ring-success/25";
    dot = "bg-success";
  }
  return (
    <span
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium whitespace-nowrap ring-1 ring-inset",
        cls,
      )}
    >
      <span className="relative flex size-1.5" aria-hidden="true">
        {pulse ? (
          <span
            className={cn(
              "absolute inline-flex size-full rounded-full opacity-60 motion-safe:animate-ping",
              dot,
            )}
          />
        ) : null}
        <span
          className={cn("relative inline-flex size-1.5 rounded-full", dot)}
        />
      </span>
      {label}
    </span>
  );
}

function ProgressCell({ row }: { row: StudentRow }) {
  const a = row.attempt;
  if (!a) return <span className="text-xs">–</span>;
  const pct = a.totalQuestions
    ? Math.round((a.answeredCount / a.totalQuestions) * 100)
    : 0;
  return (
    <div className="flex items-center gap-2.5">
      <div
        className="h-2 flex-1 overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={a.totalQuestions}
        aria-valuenow={a.answeredCount}
        aria-label={`${a.answeredCount} van ${a.totalQuestions} vragen beantwoord`}
      >
        <div
          className={cn(
            "h-full rounded-full transition-[width] duration-500",
            a.status === "submitted" ? "bg-success" : "bg-primary",
          )}
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="w-12 shrink-0 text-right text-xs text-muted-foreground tabular-nums">
        {a.answeredCount}/{a.totalQuestions}
      </span>
    </div>
  );
}

function RemainingCell({
  row,
  serverNow,
}: {
  row: StudentRow;
  serverNow: number;
}) {
  const a = row.attempt;
  if (!a || a.status !== "in_progress")
    return <span className="text-xs text-muted-foreground">–</span>;
  if (!a.deadlineAt)
    return <span className="text-xs text-muted-foreground">Geen limiet</span>;
  const left = new Date(a.deadlineAt).getTime() - serverNow;
  const content = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 font-mono text-sm font-medium tabular-nums",
        left <= 60_000
          ? "text-destructive"
          : left <= 5 * 60_000
            ? "text-warning-ink"
            : "text-foreground",
      )}
    >
      {left <= 0 ? "Tijd om" : formatRemaining(left)}
      {a.accommodationMinutes > 0 ? (
        <Clock className="size-3.5 text-info-ink" aria-hidden="true" />
      ) : null}
      {a.extraMinutes > 0 ? (
        <span className="rounded bg-info/10 px-1 font-sans text-[10px] font-semibold text-info-ink">
          +{a.extraMinutes}
          <span className="sr-only"> minuten extra gegeven</span>
        </span>
      ) : null}
    </span>
  );
  if (a.accommodationMinutes <= 0) return content;
  const help = `Inclusief ${a.accommodationMinutes} min verlengde tijd`;
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className="cursor-default rounded-sm text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring"
        >
          {content}
          <span className="sr-only"> ({help})</span>
        </button>
      </TooltipTrigger>
      <TooltipContent>{help}</TooltipContent>
    </Tooltip>
  );
}

function FocusCell({ row }: { row: StudentRow }) {
  const n = row.attempt?.focusLossCount ?? 0;
  if (!row.attempt)
    return <span className="text-xs text-muted-foreground">–</span>;
  if (n === 0)
    return (
      <span className="text-xs text-muted-foreground tabular-nums">
        0<span className="sr-only"> keer venster verlaten</span>
      </span>
    );
  return (
    <span
      className={cn(
        "inline-flex h-6 w-fit items-center gap-1 rounded-full px-2 text-xs font-semibold tabular-nums ring-1 ring-inset",
        n >= 3
          ? "bg-destructive/10 text-destructive-ink ring-destructive/25"
          : "bg-warning/12 text-warning-ink ring-warning/30",
      )}
      title={`${n} keer venster verlaten. ${FOCUS_LOSS_HELP}`}
    >
      <MonitorX className="size-3.5" aria-hidden="true" />
      {n}
      <span className="sr-only"> keer venster verlaten</span>
    </span>
  );
}

function LastSeenCell({
  row,
  serverNow,
}: {
  row: StudentRow;
  serverNow: number;
}) {
  const a = row.attempt;
  const at =
    a?.status === "submitted" ? a.submittedAt : (a?.lastSeenAt ?? a?.startedAt);
  if (!at) return <span className="text-xs text-muted-foreground">–</span>;
  const inactive =
    a?.status === "in_progress" &&
    serverNow - new Date(at).getTime() > INACTIVE_MS;
  return (
    <RelativeTime
      date={at}
      now={serverNow}
      locale="nl"
      formatStyle="short"
      className={cn(
        "text-xs",
        inactive ? "font-medium text-warning-ink" : "text-muted-foreground",
      )}
    />
  );
}

function ScoreCell({ row, scale }: { row: StudentRow; scale?: GradingScale }) {
  const a = row.attempt;
  if (!a || a.status !== "submitted")
    return <span className="text-xs text-muted-foreground">–</span>;
  if (a.gradingStatus === "pending") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-info-ink">
        <Loader2
          className="size-3.5 motion-safe:animate-spin"
          aria-hidden="true"
        />
        Nakijken…
      </span>
    );
  }
  const grade =
    a.score != null && a.maxScore
      ? computeGrade(a.score, a.maxScore, scale)
      : null;
  return (
    <span className="inline-flex flex-col items-end leading-tight">
      <span className="font-semibold text-foreground tabular-nums">
        {formatNumber(a.score)}
        <span className="font-normal text-muted-foreground">
          /{formatNumber(a.maxScore)}
        </span>
      </span>
      {a.gradingStatus === "needs_review" ? (
        <span className="text-[11px] font-medium text-warning-ink">
          nog nakijken
        </span>
      ) : grade != null ? (
        <span className="text-[11px] text-muted-foreground tabular-nums">
          cijfer {formatGrade(grade)}
        </span>
      ) : null}
    </span>
  );
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/);
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase() || "?";
}

/* --------------------------------- Actions -------------------------------- */

function useInvalidateAssignment() {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  return async () => {
    await queryClient.invalidateQueries({
      queryKey: trpc.assignment.pathKey(),
    });
    await queryClient.invalidateQueries({ queryKey: trpc.review.pathKey() });
  };
}

function RowActions({
  assignmentId,
  row,
  onDialog,
}: {
  assignmentId: string;
  row: StudentRow;
  onDialog: (d: {
    kind: "extend" | "reopen" | "reset";
    row: StudentRow;
  }) => void;
}) {
  const trpc = useTRPC();
  const invalidate = useInvalidateAssignment();
  const extend = useMutation(
    trpc.assignment.extendTime.mutationOptions({
      onSuccess: async (res, vars) => {
        await invalidate();
        toast.success(
          `${row.student.name} krijgt ${vars.minutes} minuten extra`,
          {
            description: `Totaal ${res.extraMinutes} minuten extra.`,
          },
        );
      },
      onError: (err) => toast.error(getErrorMessage(err)),
    }),
  );

  const a = row.attempt;
  if (!a) {
    return (
      <Button
        variant="ghost"
        size="icon-sm"
        disabled
        aria-label="Geen acties: nog niet begonnen"
      >
        <UserRound className="opacity-40" aria-hidden="true" />
      </Button>
    );
  }
  const canExtend = a.status === "in_progress" && a.deadlineAt != null;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Acties voor ${row.student.name}`}
        >
          {extend.isPending ? (
            <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
          ) : (
            <MoreHorizontal aria-hidden="true" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel className="truncate">
          {row.student.name}
        </DropdownMenuLabel>
        <DropdownMenuItem asChild>
          <Link href={routes.docent.attempt(assignmentId, a.id)}>
            <Eye aria-hidden="true" />
            Poging bekijken
          </Link>
        </DropdownMenuItem>
        {canExtend ? (
          <DropdownMenuSub>
            <DropdownMenuSubTrigger>
              <AlarmClockPlus aria-hidden="true" />
              Tijd verlengen
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {[5, 10, 15].map((m) => (
                <DropdownMenuItem
                  key={m}
                  onSelect={() =>
                    extend.mutate({ attemptId: a.id, minutes: m })
                  }
                >
                  +{m} minuten
                </DropdownMenuItem>
              ))}
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onSelect={() => onDialog({ kind: "extend", row })}
              >
                Anders…
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
        ) : null}
        {a.status === "submitted" ? (
          <DropdownMenuItem onSelect={() => onDialog({ kind: "reopen", row })}>
            <RotateCcw aria-hidden="true" />
            Poging heropenen…
          </DropdownMenuItem>
        ) : null}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => onDialog({ kind: "reset", row })}
          className="text-destructive focus:text-destructive [&_svg]:text-destructive"
        >
          <Trash2 aria-hidden="true" />
          Poging resetten…
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MinutesDialog({
  open,
  title,
  description,
  confirmLabel,
  defaultMinutes,
  pending,
  error,
  children,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  defaultMinutes: number;
  pending: boolean;
  error?: string | null;
  children?: React.ReactNode;
  onConfirm: (minutes: number) => void;
  onClose: () => void;
}) {
  const id = useId();
  const [value, setValue] = useState(String(defaultMinutes));
  const [showError, setShowError] = useState(false);
  const announce = useAnnounce();
  const minutes = parseExtraMinutes(value);
  const returnFocus = useDialogReturnFocus();
  return (
    <Dialog open={open} onOpenChange={(o) => !o && !pending && onClose()}>
      <DialogContent className="gap-5 sm:max-w-md" {...returnFocus}>
        <div className="flex flex-col gap-1.5">
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </div>
        <form
          className="flex flex-col gap-4"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (minutes === null) {
              // Say what is wrong instead of a silently disabled button.
              setShowError(true);
              focusInvalidField(`${id}-minutes`, MINUTES_ERROR, announce);
              return;
            }
            onConfirm(minutes);
          }}
        >
          <MinutesField
            id={id}
            value={value}
            onChange={(next) => {
              setValue(next);
              if (parseExtraMinutes(next) !== null) setShowError(false);
            }}
            showError={showError}
          />
          {children}
          {error ? (
            <p
              role="alert"
              className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive-ink"
            >
              {error}
            </p>
          ) : null}
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={pending}
            >
              Annuleren
            </Button>
            <Button type="submit" disabled={pending} aria-busy={pending}>
              {pending ? (
                <Loader2
                  className="motion-safe:animate-spin"
                  aria-hidden="true"
                />
              ) : null}
              {confirmLabel}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ExtendTimeDialog({
  row,
  onClose,
}: {
  row: StudentRow | null;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const invalidate = useInvalidateAssignment();
  const extend = useMutation(
    trpc.assignment.extendTime.mutationOptions({
      onSuccess: async (_res, vars) => {
        await invalidate();
        toast.success(
          `${row?.student.name} krijgt ${vars.minutes} minuten extra`,
        );
        onClose();
      },
    }),
  );
  return (
    <MinutesDialog
      key={row?.attempt?.id ?? "none"}
      open={!!row}
      title="Tijd verlengen"
      description={`Hoeveel minuten extra krijgt ${row?.student.name ?? "de leerling"}?`}
      confirmLabel="Verlengen"
      defaultMinutes={10}
      pending={extend.isPending}
      error={extend.error ? getErrorMessage(extend.error) : null}
      onConfirm={(minutes) =>
        row?.attempt && extend.mutate({ attemptId: row.attempt.id, minutes })
      }
      onClose={() => {
        extend.reset();
        onClose();
      }}
    />
  );
}

function ReopenAttemptDialog({
  row,
  defaultMinutes,
  assignmentClosed,
  resultsWaitForEveryone,
  onClose,
}: {
  row: StudentRow | null;
  defaultMinutes: number;
  assignmentClosed: boolean;
  resultsWaitForEveryone: boolean;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const invalidate = useInvalidateAssignment();
  const reopen = useMutation(
    trpc.assignment.reopenAttempt.mutationOptions({
      onSuccess: async (res) => {
        await invalidate();
        toast.success(`De poging van ${row?.student.name} is heropend`, {
          description:
            res.reviewedAnswers > 0
              ? "De leerling kan via ‘Mijn toetsen’ verder. Past de leerling een antwoord aan dat je al had beoordeeld, dan kijk je dat na het inleveren opnieuw na."
              : "De leerling kan via ‘Mijn toetsen’ verder waar hij of zij gebleven was.",
        });
        onClose();
      },
    }),
  );
  const reviewed =
    !!row?.attempt &&
    (row.attempt.gradingStatus === "graded" ||
      row.attempt.gradingStatus === "needs_review");
  return (
    <MinutesDialog
      key={row?.attempt?.id ?? "none"}
      open={!!row}
      title="Poging heropenen"
      description={`${row?.student.name ?? "De leerling"} kan verder werken aan de ingeleverde poging. Alle antwoorden blijven bewaard. Hoeveel tijd krijgt de leerling?`}
      confirmLabel="Heropenen"
      defaultMinutes={Math.min(defaultMinutes, 600)}
      pending={reopen.isPending}
      error={reopen.error ? getErrorMessage(reopen.error) : null}
      onConfirm={(minutes) =>
        row?.attempt && reopen.mutate({ attemptId: row.attempt.id, minutes })
      }
      onClose={() => {
        reopen.reset();
        onClose();
      }}
    >
      {row?.attempt && row.attempt.accommodationMinutes > 0 ? (
        <p className="rounded-md bg-info/10 px-3 py-2 text-sm text-info-ink">
          Deze leerling heeft verlengde tijd. De voorgestelde tijd is inclusief{" "}
          {row.attempt.accommodationMinutes} minuten verlengde tijd.
        </p>
      ) : null}
      {assignmentClosed ? (
        <p className="rounded-md bg-info/10 px-3 py-2 text-sm text-info-ink">
          De afname is gesloten, maar deze leerling kan toch verder tot de
          gekozen tijd om is.
          {resultsWaitForEveryone
            ? " Zolang de leerling bezig is, zien klasgenoten hun resultaten nog niet."
            : null}
        </p>
      ) : null}
      {reviewed ? (
        <p className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
          Past de leerling een antwoord aan dat je al hebt beoordeeld, dan
          vervallen jouw score en feedback bij dat antwoord. Je kijkt het na het
          inleveren opnieuw na.
        </p>
      ) : null}
    </MinutesDialog>
  );
}

function ResetAttemptDialog({
  row,
  onClose,
}: {
  row: StudentRow | null;
  onClose: () => void;
}) {
  const trpc = useTRPC();
  const invalidate = useInvalidateAssignment();
  const reset = useMutation(trpc.assignment.resetAttempt.mutationOptions());
  return (
    <ConfirmDialog
      open={!!row}
      onOpenChange={(o) => !o && onClose()}
      destructive
      title={`Poging van ${row?.student.name ?? "leerling"} resetten?`}
      description="De poging wordt verwijderd, met alle antwoorden, scores en het logboek. De leerling kan daarna opnieuw beginnen. Dit kun je niet ongedaan maken."
      confirmLabel="Poging resetten"
      onConfirm={async () => {
        if (!row?.attempt) return;
        await reset.mutateAsync({ attemptId: row.attempt.id });
        await invalidate();
        toast.success(`De poging van ${row.student.name} is gereset`);
      }}
    />
  );
}
