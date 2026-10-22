"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight,
  ClipboardList,
  KeyRound,
  Pencil,
  Printer,
  School,
  UserMinus,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { type ReactNode, use, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { PageHeader } from "@/components/app/page-header";
import { ErrorState, LoadingState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import {
  formatDate,
  formatDateTime,
  formatScore,
  initials,
  plural,
} from "./format";
import { PinDialog, type PinDialogStudent } from "./pin-dialog";
import { PinReveal } from "./pin-reveal";
import { StudentActionsMenu } from "./student-actions-menu";
import { StudentFormDialog } from "./student-form-dialog";
import { StudentStatus } from "./student-status";

type Student = RouterOutputs["student"]["get"];
type Attempt = Student["attempts"][number];

/** /docent/leerlingen/[leerlingId] */
export function StudentDetailPage({
  params,
}: {
  params: Promise<{ leerlingId: string }>;
}) {
  const { leerlingId } = use(params);
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [newPin, setNewPin] = useState<PinDialogStudent | null>(null);
  const [removeFrom, setRemoveFrom] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const query = useQuery(trpc.student.get.queryOptions({ id: leerlingId }));
  const resetPin = useMutation(trpc.student.resetPin.mutationOptions());
  const removeMember = useMutation(trpc.class.removeMember.mutationOptions());

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.student.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.class.pathKey() }),
    ]);

  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) {
    return (
      <>
        <PageHeader
          title="Leerling"
          backHref={routes.docent.students}
          backLabel="Leerlingen"
        />
        <ErrorState
          title="Deze leerling kon niet worden geladen"
          error={query.error}
          onRetry={
            query.error?.data?.code === "NOT_FOUND"
              ? undefined
              : () => query.refetch()
          }
        />
      </>
    );
  }

  const s = query.data;
  const submitted = s.attempts.filter((a) => a.status === "submitted");

  return (
    <>
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className="grid size-10 shrink-0 place-items-center rounded-full bg-primary/10 font-sans text-sm font-semibold text-primary ring-1 ring-primary/15"
            >
              {initials(s.name)}
            </span>
            {s.name}
          </span>
        }
        badge={<StudentStatus banned={s.banned} />}
        backHref={routes.docent.students}
        backLabel="Leerlingen"
        description={
          <>
            Leerlingnummer{" "}
            <span className="font-mono text-foreground">{s.studentNumber}</span>{" "}
            · account sinds {formatDate(s.createdAt)}
          </>
        }
        actions={
          <>
            <Button variant="outline" onClick={() => setEditing(true)}>
              <Pencil aria-hidden="true" />
              Bewerken
            </Button>
            <StudentActionsMenu
              className="size-9 border bg-background shadow-xs"
              student={{
                id: s.id,
                name: s.name,
                studentNumber: s.studentNumber,
                banned: s.banned,
              }}
              onDeleted={() => router.push(routes.docent.students)}
            />
          </>
        }
      />

      {s.banned ? (
        <p className="rounded-lg border border-destructive/20 bg-destructive/[0.05] px-4 py-3 text-sm text-destructive-ink">
          Dit account is gedeactiveerd: de leerling kan niet inloggen. Activeer
          het via het menu met de drie puntjes.
        </p>
      ) : null}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,20rem)_minmax(0,1fr)]">
        <div className="flex flex-col gap-6">
          <Panel title="Inloggen" icon={<KeyRound className="size-4" />}>
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                  Pincode
                </span>
                <PinReveal userId={s.id} hasPin={s.hasPin} size="lg" />
              </div>
              <dl className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Leerlingnummer
                  </dt>
                  <dd className="font-mono">{s.studentNumber}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">
                    Laatst ingelogd
                  </dt>
                  <dd>{formatDateTime(s.lastLoginAt, "Onbekend")}</dd>
                </div>
              </dl>
              <div className="grid grid-cols-2 gap-2 lg:grid-cols-1 xl:grid-cols-2">
                <ConfirmDialog
                  trigger={
                    <Button variant="outline" size="sm" className="w-full">
                      <KeyRound aria-hidden="true" />
                      Nieuwe pincode
                    </Button>
                  }
                  title={`Pincode van ${s.name} resetten?`}
                  description="De leerling krijgt een nieuwe pincode en wordt op alle apparaten uitgelogd."
                  confirmLabel="Nieuwe pincode maken"
                  onConfirm={async () => {
                    const res = await resetPin.mutateAsync({ id: s.id });
                    await invalidate();
                    setNewPin(res);
                  }}
                />
                <Button variant="outline" size="sm" className="w-full" asChild>
                  <Link
                    href={routes.docent.studentLoginCards([s.id])}
                    target="_blank"
                    rel="noopener"
                  >
                    <Printer aria-hidden="true" />
                    Inlogkaart
                  </Link>
                </Button>
              </div>
            </div>
          </Panel>

          <Panel title="Klassen" icon={<School className="size-4" />}>
            {s.classes.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Deze leerling zit nog niet in een klas. Voeg de leerling toe
                vanuit een klas via{" "}
                <span className="font-medium text-foreground">
                  Leerlingen importeren → Bestaande leerling
                </span>
                .
              </p>
            ) : (
              <ul className="-mx-2 flex flex-col">
                {s.classes.map((c) => (
                  <li
                    key={c.id}
                    className="group flex items-center gap-2 rounded-md px-2 py-1.5 hover:bg-muted/50"
                  >
                    <Link
                      href={routes.docent.class(c.id)}
                      className="flex min-w-0 flex-1 flex-col outline-none focus-visible:underline"
                    >
                      <span
                        className={cn(
                          "truncate text-sm font-medium",
                          c.archived && "text-muted-foreground",
                        )}
                      >
                        {c.name}
                        {c.archived ? " (gearchiveerd)" : ""}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {c.schoolYear ? `${c.schoolYear} · ` : ""}sinds{" "}
                        {formatDate(c.addedAt)}
                      </span>
                    </Link>
                    <Button
                      variant="ghost"
                      size="icon-xs"
                      className="text-muted-foreground hover:text-foreground"
                      aria-label={`Uit ${c.name} halen`}
                      onClick={() => setRemoveFrom({ id: c.id, name: c.name })}
                    >
                      <UserMinus className="size-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>

        <Panel
          title="Pogingen"
          icon={<ClipboardList className="size-4" />}
          aside={
            s.attempts.length > 0
              ? `${plural(s.attempts.length, "poging", "pogingen")} · ${submitted.length} ingeleverd`
              : undefined
          }
          flush
        >
          {s.attempts.length === 0 ? (
            <p className="px-5 pb-5 text-sm text-muted-foreground">
              Deze leerling heeft nog geen afnames gemaakt.
            </p>
          ) : (
            <ul className="divide-y border-t">
              {s.attempts.map((a) => (
                <AttemptRow key={a.id} attempt={a} />
              ))}
            </ul>
          )}
        </Panel>
      </div>

      <StudentFormDialog open={editing} onOpenChange={setEditing} student={s} />
      <PinDialog
        open={newPin !== null}
        onOpenChange={(open) => !open && setNewPin(null)}
        student={newPin}
      />
      <ConfirmDialog
        open={removeFrom !== null}
        onOpenChange={(open) => !open && setRemoveFrom(null)}
        title={`${s.name} uit ${removeFrom?.name ?? "de klas"} halen?`}
        description="Het account en de resultaten blijven bestaan."
        confirmLabel="Uit klas halen"
        onConfirm={async () => {
          if (!removeFrom) return;
          await removeMember.mutateAsync({
            classId: removeFrom.id,
            userId: s.id,
          });
          await invalidate();
          toast.success(`${s.name} is uit ${removeFrom.name} gehaald`);
        }}
      />
    </>
  );
}

function Panel({
  title,
  icon,
  aside,
  flush,
  children,
}: {
  title: string;
  icon?: ReactNode;
  aside?: ReactNode;
  flush?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="flex flex-col overflow-hidden rounded-xl border bg-card text-card-foreground shadow-xs">
      <header className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4 pb-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          {icon ? <span className="text-muted-foreground">{icon}</span> : null}
          {title}
        </h2>
        {aside ? (
          <span className="text-xs text-muted-foreground">{aside}</span>
        ) : null}
      </header>
      <div className={flush ? undefined : "px-5 pb-5"}>{children}</div>
    </section>
  );
}

function AttemptRow({ attempt: a }: { attempt: Attempt }) {
  const pct =
    a.score != null && a.maxScore
      ? Math.round((a.score / a.maxScore) * 100)
      : null;
  return (
    <li>
      <Link
        href={routes.docent.attempt(a.assignmentId, a.id)}
        className="group flex items-center gap-4 px-5 py-3 outline-none transition-colors hover:bg-muted/40 focus-visible:bg-muted/50"
      >
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="truncate text-sm font-medium">
            {a.assignmentTitle}
            {a.attemptNumber > 1 ? (
              <span className="font-normal text-muted-foreground">
                {" "}
                · poging {a.attemptNumber}
              </span>
            ) : null}
          </span>
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
            <span>{a.className}</span>
            <span aria-hidden="true">·</span>
            <span>{a.mode === "practice" ? "Oefenen" : "Toets"}</span>
            <span aria-hidden="true">·</span>
            <span>
              {a.submittedAt
                ? `Ingeleverd ${formatDateTime(a.submittedAt)}`
                : `Gestart ${formatDateTime(a.startedAt)}`}
            </span>
            {a.focusLossCount > 0 ? (
              <>
                <span aria-hidden="true">·</span>
                <span className="text-warning-ink">
                  {a.focusLossCount}× venster verlaten
                </span>
              </>
            ) : null}
          </span>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {a.status === "submitted" ? (
            <StatusBadge kind="grading" status={a.gradingStatus} />
          ) : (
            <StatusBadge kind="attempt" status={a.status} />
          )}
          {a.status === "submitted" ? (
            <span className="text-xs tabular-nums text-muted-foreground">
              {formatScore(a.score, a.maxScore)}
              {pct != null ? ` · ${pct}%` : ""}
            </span>
          ) : null}
        </div>
        <ChevronRight
          className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
          aria-hidden="true"
        />
      </Link>
    </li>
  );
}
