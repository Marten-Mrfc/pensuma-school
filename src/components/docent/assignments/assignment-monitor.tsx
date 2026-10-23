"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Clock,
  CopyPlus,
  Eye,
  KeyRound,
  Lock,
  MonitorX,
  MoreHorizontal,
  Play,
  Presentation,
  RefreshCw,
  Repeat,
  RotateCcw,
  Settings2,
  Trash2,
  UserRoundCheck,
  UserRoundX,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import { useAnnounce } from "@/components/a11y/live-announcer";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { CopyButton } from "@/components/app/copy-button";
import { getErrorMessage } from "@/components/app/get-error-message";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { ErrorState, LoadingState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Switch } from "@/components/ui/switch";
import { useDocumentTitle } from "@/lib/a11y/use-document-title";
import { describeScale } from "@/lib/grading/grade-scale";
import { SHOW_RESULTS_LABELS } from "@/lib/questions/schema";
import { routes } from "@/lib/routes";
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import { plural } from "../students/format";
import { AccessCodePresenter } from "./access-code-presenter";
import { AssignmentNav, useNow } from "./assignment-nav";
import { DuplicateAssignmentDialog } from "./duplicate-assignment-dialog";
import {
  deleteAssignmentDescription,
  formatMinutes,
  formatMoment,
  formatWindow,
} from "./format";
import { MonitorTable } from "./monitor-table";
import { SelectStudentsDialog } from "./select-students-dialog";
import { SettingsSheet } from "./settings-sheet";
import { InfoItem, ModeBadge, TargetingBadges } from "./shared";

type Assignment = RouterOutputs["assignment"]["get"];
type Monitor = RouterOutputs["assignment"]["monitor"];

/**
 * Announce "{naam} heeft ingeleverd." for every student whose attempt was
 * submitted since the previous poll (only when the teacher turned it on).
 */
function useSubmissionAnnouncements(data: Monitor | undefined, on: boolean) {
  const announce = useAnnounce();
  const previous = useRef<Map<string, string> | null>(null);
  useEffect(() => {
    if (!data) return;
    const current = new Map(
      data.students.map((s) => [
        s.student.id,
        s.attempt ? `${s.attempt.id}:${s.attempt.status}` : "none",
      ]),
    );
    const before = previous.current;
    previous.current = current;
    if (!on || !before) return;
    for (const s of data.students) {
      const was = before.get(s.student.id);
      const now = current.get(s.student.id);
      if (was !== now && s.attempt?.status === "submitted") {
        announce(`${s.student.name} heeft ingeleverd.`, {
          dedupeKey: `submitted:${s.attempt.id}`,
          dedupeMs: 60_000,
        });
      }
    }
  }, [data, on, announce]);
}

export function AssignmentMonitor({
  params,
}: {
  params: Promise<{ afnameId: string }>;
}) {
  const { afnameId } = use(params);
  const trpc = useTRPC();
  const id = useId();
  // WCAG 2.2.2: the teacher can pause the automatic updates.
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [announceSubmissions, setAnnounceSubmissions] = useState(false);
  const assignment = useQuery(
    trpc.assignment.get.queryOptions(
      { id: afnameId },
      { refetchInterval: autoRefresh ? 15_000 : false },
    ),
  );
  const monitor = useQuery(
    trpc.assignment.monitor.queryOptions(
      { id: afnameId },
      {
        refetchInterval: autoRefresh ? 5_000 : false,
        refetchIntervalInBackground: false,
      },
    ),
  );
  const now = useNow(1000);
  useSubmissionAnnouncements(monitor.data, announceSubmissions);
  useDocumentTitle([assignment.data?.title, "Live overzicht"]);

  if (assignment.isPending) return <LoadingState />;
  if (assignment.isError) {
    return (
      <ErrorState
        title="Deze afname kon niet worden geladen"
        error={assignment.error}
        onRetry={() => assignment.refetch()}
      />
    );
  }
  const a = assignment.data;
  const serverOffsetMs = monitor.data
    ? new Date(monitor.data.serverTime).getTime() - monitor.dataUpdatedAt
    : 0;

  return (
    // grid-cols-1 (minmax(0, 1fr)): wide tables scroll inside their region
    // instead of widening the page on phones.
    <div className="grid grid-cols-1 gap-6">
      <MonitorHeader
        assignment={a}
        monitorStarted={
          monitor.data
            ? monitor.data.students.length - monitor.data.summary.notStarted
            : a.counts.started
        }
        inProgress={monitor.data?.summary.inProgress ?? a.counts.inProgress}
        inProgressWithAccommodation={
          monitor.data?.summary.inProgressWithAccommodation ?? 0
        }
      />
      <AssignmentNav assignmentId={a.id} active="monitor" />

      <StatusBanner
        assignment={a}
        inProgress={monitor.data?.summary.inProgress ?? a.counts.inProgress}
      />

      <div className="flex flex-col gap-2 rounded-xl border bg-card px-4 py-3 shadow-xs sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
        <label
          htmlFor={`${id}-refresh`}
          className="flex cursor-pointer items-center gap-2.5 text-sm font-medium"
        >
          <Switch
            id={`${id}-refresh`}
            checked={autoRefresh}
            onCheckedChange={setAutoRefresh}
          />
          Automatisch bijwerken
        </label>
        <label
          htmlFor={`${id}-announce`}
          className="flex cursor-pointer items-center gap-2.5 text-sm font-medium"
        >
          <Switch
            id={`${id}-announce`}
            checked={announceSubmissions}
            onCheckedChange={setAnnounceSubmissions}
          />
          Inleveringen voorlezen
        </label>
        <p className="flex items-center gap-1.5 text-xs text-muted-foreground sm:ml-auto">
          <RefreshCw className="size-3.5" aria-hidden="true" />
          {autoRefresh
            ? "Ververst automatisch elke 5 seconden."
            : "Automatisch bijwerken staat uit."}
          {!autoRefresh ? (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs"
              onClick={() => {
                void monitor.refetch();
                void assignment.refetch();
              }}
            >
              Nu verversen
            </Button>
          ) : null}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Niet begonnen"
          value={monitor.data?.summary.notStarted ?? "–"}
          icon={UserRoundX}
          hint={`van ${plural(monitor.data?.summary.students ?? a.counts.students, "leerling", "leerlingen")}`}
        />
        <StatCard
          label="Bezig"
          value={monitor.data?.summary.inProgress ?? "–"}
          icon={Users}
          tone="warning"
        />
        <StatCard
          label="Ingeleverd"
          value={monitor.data?.summary.submitted ?? "–"}
          icon={CheckCircle2}
          tone="success"
        />
        <StatCard
          label="Vensterwissels"
          value={monitor.data?.summary.focusWarnings ?? "–"}
          icon={MonitorX}
          tone={
            (monitor.data?.summary.focusWarnings ?? 0) > 0
              ? "destructive"
              : "default"
          }
          hint={
            a.settings.logFocusEvents
              ? "leerlingen met minstens één wissel"
              : "registreren staat uit"
          }
        />
      </div>

      <InfoStrip assignment={a} />

      {monitor.isPending ? (
        <LoadingState variant="list" />
      ) : monitor.isError ? (
        <ErrorState error={monitor.error} onRetry={() => monitor.refetch()} />
      ) : (
        <MonitorTable
          assignmentId={a.id}
          data={monitor.data}
          now={now}
          serverOffsetMs={serverOffsetMs}
          scale={a.settings.grading}
          logFocusEvents={a.settings.logFocusEvents}
          resultsWaitForEveryone={
            a.settings.showResults === "after_close" && !a.resultsReleased
          }
        />
      )}
    </div>
  );
}

function useAssignmentMutations(assignment: Assignment) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const invalidate = async () => {
    await queryClient.invalidateQueries({
      queryKey: trpc.assignment.pathKey(),
    });
    await queryClient.invalidateQueries({ queryKey: trpc.dashboard.pathKey() });
  };
  /** After deleting: drop this afname's cached queries instead of refetching them. */
  const forget = (id: string) => {
    queryClient.removeQueries({
      queryKey: trpc.assignment.get.queryKey({ id }),
    });
    queryClient.removeQueries({
      queryKey: trpc.assignment.monitor.queryKey({ id }),
    });
    queryClient.removeQueries({ queryKey: trpc.review.pathKey() });
    void queryClient.invalidateQueries({
      queryKey: trpc.assignment.list.queryKey(),
    });
    void queryClient.invalidateQueries({ queryKey: trpc.dashboard.pathKey() });
  };
  const onError = (err: unknown) => toast.error(getErrorMessage(err));
  return {
    open: useMutation(
      trpc.assignment.open.mutationOptions({
        onSuccess: async () => {
          await invalidate();
          toast.success("De afname is open", {
            description: assignment.accessCode
              ? `Toegangscode: ${assignment.accessCode}`
              : "Leerlingen kunnen beginnen.",
          });
        },
        onError,
      }),
    ),
    close: useMutation(trpc.assignment.close.mutationOptions()),
    reopen: useMutation(trpc.assignment.reopen.mutationOptions()),
    remove: useMutation(trpc.assignment.delete.mutationOptions()),
    regenerate: useMutation(
      trpc.assignment.regenerateAccessCode.mutationOptions({
        onSuccess: async (res) => {
          await invalidate();
          toast.success(`Nieuwe toegangscode: ${res.accessCode}`);
        },
        onError,
      }),
    ),
    invalidate,
    forget,
    router,
  };
}

function MonitorHeader({
  assignment: a,
  monitorStarted,
  inProgress,
  inProgressWithAccommodation,
}: {
  assignment: Assignment;
  monitorStarted: number;
  inProgress: number;
  inProgressWithAccommodation: number;
}) {
  const id = useId();
  const m = useAssignmentMutations(a);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const [choosingStudents, setChoosingStudents] = useState(false);
  const [submitAccommodated, setSubmitAccommodated] = useState(false);
  const [confirm, setConfirm] = useState<"close" | "reopen" | "delete" | null>(
    null,
  );
  const status = a.effectiveStatus;
  const othersInProgress = Math.max(
    0,
    inProgress - inProgressWithAccommodation,
  );

  return (
    <>
      <PageHeader
        backHref={routes.docent.assignments}
        backLabel="Afnames"
        title={a.title}
        badge={
          <>
            <StatusBadge kind="assignment" status={status} />
            <ModeBadge mode={a.mode} />
            <TargetingBadges
              retakeOf={a.retakeOf}
              targetedStudentCount={a.targetedStudentCount}
            />
          </>
        }
        description={
          <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-4" aria-hidden="true" />
              {a.class.name}
            </span>
            <span>
              {a.test.title} · {a.test.questionCount} vragen ·{" "}
              {a.test.totalPoints.toLocaleString("nl-NL")} punten
            </span>
          </span>
        }
        actions={
          <>
            {a.accessCode && status !== "closed" ? (
              <Button
                variant="outline"
                size="lg"
                onClick={() => setPresenting(true)}
              >
                <Presentation aria-hidden="true" />
                Toon toegangscode
              </Button>
            ) : null}
            {status === "planned" ? (
              <Button
                size="lg"
                onClick={() => m.open.mutate({ id: a.id })}
                disabled={m.open.isPending}
              >
                <Play aria-hidden="true" />
                Nu openen
              </Button>
            ) : status === "open" ? (
              <Button
                size="lg"
                variant="destructive"
                onClick={() => setConfirm("close")}
              >
                <Lock aria-hidden="true" />
                Sluiten
              </Button>
            ) : (
              <Button
                size="lg"
                variant="outline"
                onClick={() => setConfirm("reopen")}
              >
                <RotateCcw aria-hidden="true" />
                Heropenen
              </Button>
            )}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  variant="outline"
                  size="icon-lg"
                  aria-label="Meer acties"
                >
                  <MoreHorizontal aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-60">
                <DropdownMenuItem onSelect={() => setSettingsOpen(true)}>
                  <Settings2 aria-hidden="true" />
                  Instellingen bewerken
                </DropdownMenuItem>
                {a.accessCode ? (
                  <DropdownMenuItem onSelect={() => setPresenting(true)}>
                    <Presentation aria-hidden="true" />
                    Toegangscode presenteren
                  </DropdownMenuItem>
                ) : null}
                <DropdownMenuItem
                  onSelect={() => m.regenerate.mutate({ id: a.id })}
                >
                  <KeyRound aria-hidden="true" />
                  {a.accessCode ? "Nieuwe toegangscode" : "Toegangscode maken"}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <Link href={routes.docent.test(a.test.id)}>
                    <Eye aria-hidden="true" />
                    Toets bekijken
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setChoosingStudents(true)}>
                  <UserRoundCheck aria-hidden="true" />
                  Leerlingen kiezen…
                </DropdownMenuItem>
                <DropdownMenuItem onSelect={() => setDuplicating(true)}>
                  <CopyPlus aria-hidden="true" />
                  Dupliceren naar andere klas…
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link
                    href={routes.docent.newAssignment({
                      testId: a.test.id,
                      classId: a.class.id,
                    })}
                  >
                    <CalendarPlus aria-hidden="true" />
                    Opnieuw plannen
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => setConfirm("delete")}
                  className="text-destructive focus:text-destructive [&_svg]:text-destructive"
                >
                  <Trash2 aria-hidden="true" />
                  Afname verwijderen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <ConfirmDialog
        open={confirm === "close"}
        onOpenChange={(o) => {
          if (!o) {
            setConfirm(null);
            setSubmitAccommodated(false);
          }
        }}
        destructive
        title="Afname sluiten?"
        description={
          othersInProgress > 0
            ? `${othersInProgress} ${othersInProgress === 1 ? "leerling is" : "leerlingen zijn"} nog bezig. Hun werk wordt nu automatisch ingeleverd en nagekeken. Daarna kan niemand meer beginnen.`
            : "Daarna kan niemand meer beginnen. Je kunt de afname later heropenen."
        }
        confirmLabel={
          // Students with verlengde tijd keep working unless the box is ticked.
          othersInProgress > 0 ||
          (submitAccommodated && inProgressWithAccommodation > 0)
            ? "Sluiten en inleveren"
            : "Sluiten"
        }
        onConfirm={async () => {
          const res = await m.close.mutateAsync({
            id: a.id,
            respectAccommodations: !submitAccommodated,
          });
          await m.invalidate();
          if (res.stillWorking > 0) {
            toast.success(
              `Afname gesloten. ${res.stillWorking} ${res.stillWorking === 1 ? "leerling" : "leerlingen"} met verlengde tijd ${res.stillWorking === 1 ? "is" : "zijn"} nog bezig.`,
              {
                description: res.autoSubmitted
                  ? `${res.autoSubmitted} poging(en) automatisch ingeleverd.`
                  : undefined,
              },
            );
          } else {
            toast.success("De afname is gesloten", {
              description: res.autoSubmitted
                ? `${res.autoSubmitted} poging(en) automatisch ingeleverd. Het nakijken loopt op de achtergrond.`
                : undefined,
            });
          }
          setSubmitAccommodated(false);
        }}
      >
        {inProgressWithAccommodation > 0 ? (
          <div className="flex flex-col gap-3 rounded-lg border border-info/25 bg-info/[0.06] p-3 text-sm">
            <p className="flex items-start gap-2">
              <Clock
                className="mt-0.5 size-4 shrink-0 text-info-ink"
                aria-hidden="true"
              />
              {inProgressWithAccommodation === 1
                ? "1 leerling met verlengde tijd werkt nog door tot de eigen eindtijd."
                : `${inProgressWithAccommodation} leerlingen met verlengde tijd werken nog door tot hun eigen eindtijd.`}
            </p>
            {a.settings.showResults === "after_close" &&
            !a.resultsReleased &&
            !submitAccommodated ? (
              <p className="text-muted-foreground">
                De klas ziet de resultaten en de juiste antwoorden pas als ook
                {inProgressWithAccommodation === 1
                  ? " deze leerling klaar is"
                  : " deze leerlingen klaar zijn"}
                .
              </p>
            ) : null}
            <Checkbox
              id={`${id}-submit-accommodated`}
              checked={submitAccommodated}
              onCheckedChange={(v) => setSubmitAccommodated(v === true)}
              label="Ook deze leerlingen nu laten inleveren"
            />
          </div>
        ) : null}
      </ConfirmDialog>
      <ConfirmDialog
        open={confirm === "reopen"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Afname heropenen?"
        description="Leerlingen die nog niet begonnen zijn, kunnen dan alsnog starten. Ingeleverde pogingen blijven ingeleverd; die kun je per leerling heropenen."
        confirmLabel="Heropenen"
        onConfirm={async () => {
          const res = await m.reopen.mutateAsync({ id: a.id });
          await m.invalidate();
          toast.success("De afname is weer open", {
            description: res.restoredDeadlines
              ? `${res.restoredDeadlines} ${res.restoredDeadlines === 1 ? "leerling die nog bezig was, krijgt" : "leerlingen die nog bezig waren, krijgen"} de eigen tijd weer terug.`
              : undefined,
          });
        }}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        destructive
        title="Afname verwijderen?"
        description={deleteAssignmentDescription(a.counts.started)}
        confirmLabel="Verwijderen"
        onConfirm={async () => {
          await m.remove.mutateAsync({ id: a.id });
          toast.success("De afname is verwijderd");
          m.router.push(routes.docent.assignments);
          setTimeout(() => m.forget(a.id), 500);
        }}
      />

      <SettingsSheet
        assignment={a}
        open={settingsOpen}
        onOpenChange={setSettingsOpen}
      />
      <DuplicateAssignmentDialog
        open={duplicating}
        onOpenChange={setDuplicating}
        assignment={a}
      />
      <SelectStudentsDialog
        open={choosingStudents}
        onOpenChange={setChoosingStudents}
        assignment={a}
      />
      {presenting && a.accessCode ? (
        <AccessCodePresenter
          code={a.accessCode}
          title={a.title}
          className={a.class.name}
          started={monitorStarted}
          students={a.counts.students}
          onClose={() => setPresenting(false)}
        />
      ) : null}
    </>
  );
}

function StatusBanner({
  assignment: a,
  inProgress,
}: {
  assignment: Assignment;
  inProgress: number;
}) {
  if (a.effectiveStatus === "planned") {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-info/25 bg-info/[0.06] p-4 text-sm">
        <CalendarClock
          className="mt-0.5 size-5 shrink-0 text-info-ink"
          aria-hidden="true"
        />
        <p>
          {a.opensAt ? (
            <>
              Deze afname gaat <strong>{formatMoment(a.opensAt)}</strong>{" "}
              vanzelf open. Tot die tijd zien leerlingen hem nog niet.
            </>
          ) : (
            <>
              Leerlingen zien deze afname nog niet. Klik op ‘Nu openen’ als de
              klas klaar is om te beginnen.
            </>
          )}
        </p>
      </div>
    );
  }
  if (a.effectiveStatus === "closed") {
    return (
      <div className="flex flex-col gap-3 rounded-xl border bg-muted/40 p-4 text-sm sm:flex-row sm:items-center">
        <Lock
          className="size-5 shrink-0 text-muted-foreground"
          aria-hidden="true"
        />
        <p className="flex-1">
          Deze afname is gesloten
          {a.closesAt ? ` (${formatMoment(a.closesAt)})` : ""}.{" "}
          {inProgress > 0
            ? `${inProgress} ${inProgress === 1 ? "leerling werkt" : "leerlingen werken"} nog door tot de eigen eindtijd. `
            : null}
          Bekijk de resultaten of kijk de open vragen na.
        </p>
        <div className="flex gap-2">
          <Button asChild size="sm" variant="outline">
            <Link href={routes.docent.assignmentGrading(a.id)}>Nakijken</Link>
          </Button>
          <Button asChild size="sm">
            <Link href={routes.docent.assignmentResults(a.id)}>Resultaten</Link>
          </Button>
        </div>
      </div>
    );
  }
  if (a.closesAt) {
    return (
      <div className="flex items-start gap-3 rounded-xl border border-success/25 bg-success/[0.06] p-4 text-sm">
        <Clock
          className="mt-0.5 size-5 shrink-0 text-success-ink"
          aria-hidden="true"
        />
        <p>
          De afname sluit automatisch{" "}
          <strong>{formatMoment(a.closesAt)}</strong>.
          {inProgress > 0
            ? " Wie dan nog bezig is, levert automatisch in."
            : ""}
        </p>
      </div>
    );
  }
  return null;
}

function InfoStrip({ assignment: a }: { assignment: Assignment }) {
  return (
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border bg-card p-4 shadow-xs sm:grid-cols-3 lg:grid-cols-4">
      <InfoItem label="Tijdvak">
        <span className="inline-flex items-center gap-1.5">
          <CalendarClock
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
          {formatWindow(a.opensAt, a.closesAt)}
        </span>
      </InfoItem>
      <InfoItem label="Tijdslimiet">
        <span className="inline-flex items-center gap-1.5">
          <Clock className="size-4 text-muted-foreground" aria-hidden="true" />
          {formatMinutes(a.timeLimitMinutes)}
        </span>
      </InfoItem>
      <InfoItem label="Toegangscode">
        {a.accessCode ? (
          <span className="inline-flex items-center gap-1">
            <span className="font-mono text-base font-bold tracking-widest">
              {a.accessCode}
            </span>
            <CopyButton
              value={a.accessCode}
              size="icon-xs"
              successMessage="Code gekopieerd"
            />
          </span>
        ) : (
          <span className="text-muted-foreground">Geen</span>
        )}
      </InfoItem>
      <InfoItem label="Resultaten tonen">
        {SHOW_RESULTS_LABELS[a.settings.showResults]}
      </InfoItem>
      <InfoItem label="Pogingen">
        <span className="inline-flex items-center gap-1.5">
          <Repeat className="size-4 text-muted-foreground" aria-hidden="true" />
          {a.settings.maxAttempts === 1
            ? "1 poging"
            : `max. ${a.settings.maxAttempts}`}
        </span>
      </InfoItem>
      <InfoItem label="Cijferberekening">
        <span className="whitespace-normal">
          {describeScale(a.settings.grading)}
        </span>
      </InfoItem>
      {a.accommodationCount > 0 ? (
        <InfoItem label="Verlengde tijd">
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-4 text-info-ink" aria-hidden="true" />
            {a.accommodationCount}{" "}
            {a.accommodationCount === 1 ? "leerling" : "leerlingen"}
          </span>
        </InfoItem>
      ) : null}
    </div>
  );
}
