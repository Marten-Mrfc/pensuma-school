"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  CalendarClock,
  CalendarPlus,
  CheckCircle2,
  Clock,
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
  UserRoundX,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { CopyButton } from "@/components/app/copy-button";
import { getErrorMessage } from "@/components/app/get-error-message";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { ErrorState, LoadingState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SHOW_RESULTS_LABELS } from "@/lib/questions/schema";
import { routes } from "@/lib/routes";
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import { AccessCodePresenter } from "./access-code-presenter";
import { AssignmentNav, useNow } from "./assignment-nav";
import { formatMinutes, formatMoment, formatWindow } from "./format";
import { MonitorTable } from "./monitor-table";
import { SettingsSheet } from "./settings-sheet";
import { InfoItem, ModeBadge } from "./shared";

type Assignment = RouterOutputs["assignment"]["get"];

export function AssignmentMonitor({
  params,
}: {
  params: Promise<{ afnameId: string }>;
}) {
  const { afnameId } = use(params);
  const trpc = useTRPC();
  const assignment = useQuery(
    trpc.assignment.get.queryOptions(
      { id: afnameId },
      { refetchInterval: 15_000 },
    ),
  );
  const monitor = useQuery(
    trpc.assignment.monitor.queryOptions(
      { id: afnameId },
      { refetchInterval: 5_000, refetchIntervalInBackground: false },
    ),
  );
  const now = useNow(1000);

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
    <div className="flex flex-col gap-6">
      <MonitorHeader
        assignment={a}
        monitorStarted={
          monitor.data
            ? monitor.data.students.length - monitor.data.summary.notStarted
            : a.counts.started
        }
        inProgress={monitor.data?.summary.inProgress ?? a.counts.inProgress}
      />
      <AssignmentNav assignmentId={a.id} active="monitor" />

      <StatusBanner
        assignment={a}
        inProgress={monitor.data?.summary.inProgress ?? a.counts.inProgress}
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          label="Niet begonnen"
          value={monitor.data?.summary.notStarted ?? "–"}
          icon={UserRoundX}
          hint={`van ${monitor.data?.summary.students ?? a.counts.students} leerlingen`}
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
        />
      )}

      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <RefreshCw className="size-3.5" aria-hidden="true" />
        Ververst automatisch elke 5 seconden.
      </p>
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
}: {
  assignment: Assignment;
  monitorStarted: number;
  inProgress: number;
}) {
  const m = useAssignmentMutations(a);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const [confirm, setConfirm] = useState<"close" | "reopen" | "delete" | null>(
    null,
  );
  const status = a.effectiveStatus;

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
        onOpenChange={(o) => !o && setConfirm(null)}
        destructive
        title="Afname sluiten?"
        description={
          inProgress > 0
            ? `${inProgress} ${inProgress === 1 ? "leerling is" : "leerlingen zijn"} nog bezig. Hun werk wordt nu automatisch ingeleverd en nagekeken. Daarna kan niemand meer beginnen.`
            : "Daarna kan niemand meer beginnen of verder werken. Je kunt de afname later heropenen."
        }
        confirmLabel="Sluiten en inleveren"
        onConfirm={async () => {
          const res = await m.close.mutateAsync({ id: a.id });
          await m.invalidate();
          toast.success("De afname is gesloten", {
            description: res.autoSubmitted
              ? `${res.autoSubmitted} poging(en) automatisch ingeleverd. Het nakijken loopt op de achtergrond.`
              : undefined,
          });
        }}
      />
      <ConfirmDialog
        open={confirm === "reopen"}
        onOpenChange={(o) => !o && setConfirm(null)}
        title="Afname heropenen?"
        description="Leerlingen die nog niet begonnen zijn, kunnen dan alsnog starten. Ingeleverde pogingen blijven ingeleverd; die kun je per leerling heropenen."
        confirmLabel="Heropenen"
        onConfirm={async () => {
          await m.reopen.mutateAsync({ id: a.id });
          await m.invalidate();
          toast.success("De afname is weer open");
        }}
      />
      <ConfirmDialog
        open={confirm === "delete"}
        onOpenChange={(o) => !o && setConfirm(null)}
        destructive
        title="Afname verwijderen?"
        description={
          a.counts.started > 0
            ? `Alle ${a.counts.started} pogingen met antwoorden en scores worden ook verwijderd. Dit kun je niet ongedaan maken.`
            : "De afname wordt verwijderd. De toets zelf blijft bestaan."
        }
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
          {a.closesAt ? ` (${formatMoment(a.closesAt)})` : ""}. Bekijk de
          resultaten of kijk de open vragen na.
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
    <div className="grid grid-cols-2 gap-x-6 gap-y-4 rounded-xl border bg-card p-4 shadow-xs sm:grid-cols-3 lg:grid-cols-5">
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
    </div>
  );
}
