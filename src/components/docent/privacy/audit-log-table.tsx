"use client";

import { useInfiniteQuery, useMutation, useQuery } from "@tanstack/react-query";
import { Download, Filter, Loader2, ScrollText, X } from "lucide-react";
import Link from "next/link";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useAnnounce } from "@/components/a11y/live-announcer";
import { ScrollRegion } from "@/components/a11y/scroll-region";
import { FormField } from "@/components/app/form-field";
import { getErrorMessage } from "@/components/app/get-error-message";
import { PageHeader } from "@/components/app/page-header";
import { EmptyBlock, ErrorState, LoadingState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RelativeTime } from "@/components/ui/relative-time";
import { downloadTextFile } from "@/lib/export/download";
import {
  AUDIT_ACTIONS,
  AUDIT_CATEGORY_LABELS,
  type AuditCategory,
} from "@/lib/privacy/audit-actions";
import {
  ACTOR_ROLE_LABELS,
  actionsByCategory,
} from "@/lib/privacy/audit-format";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import { formatDateTime } from "../students/format";
import { type PickedStudent, StudentPicker } from "./student-picker";

type Row = RouterOutputs["privacy"]["auditLog"]["rows"][number];

const PAGE_SIZE = 50;

const CATEGORY_TONES: Record<AuditCategory, string> = {
  auth: "bg-info/10 text-info-ink",
  access: "bg-primary/10 text-primary",
  change: "bg-muted text-foreground",
  security: "bg-destructive/10 text-destructive-ink",
  privacy: "bg-warning/15 text-warning-ink",
};

const selectClass =
  "h-10 w-full rounded-md border bg-background px-3 text-sm shadow-xs outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 dark:bg-input/30";

/** "category:auth" or "action:student.viewed" in the select. */
function parseKind(value: string) {
  if (value.startsWith("category:")) {
    return { category: value.slice(9) as AuditCategory, action: undefined };
  }
  if (value.startsWith("action:")) {
    return { category: undefined, action: value.slice(7) };
  }
  return { category: undefined, action: undefined };
}

/** /docent/privacy/logboek: the read-only audit log of teacher actions. */
export function AuditLogTable() {
  const trpc = useTRPC();
  const announce = useAnnounce();
  const id = useId();
  const [actorId, setActorId] = useState("");
  const [student, setStudent] = useState<PickedStudent | null>(null);
  const [kind, setKind] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const staff = useQuery(trpc.staff.list.queryOptions());
  const { category, action } = parseKind(kind);

  const filters = {
    actorId: actorId || undefined,
    subjectUserId: student?.id,
    category,
    action,
    from: from || undefined,
    to: to || undefined,
  };
  const log = useInfiniteQuery(
    trpc.privacy.auditLog.infiniteQueryOptions(
      { ...filters, limit: PAGE_SIZE },
      { getNextPageParam: (last) => last.nextCursor ?? undefined },
    ),
  );
  const exportLog = useMutation(trpc.privacy.exportAuditLog.mutationOptions());
  const rows = log.data?.pages.flatMap((p) => p.rows) ?? [];
  const filtered = !!actorId || !!student || !!kind || !!from || !!to;
  const grouped = actionsByCategory();

  function clearFilters() {
    setActorId("");
    setStudent(null);
    setKind("");
    setFrom("");
    setTo("");
  }

  async function handleExport() {
    try {
      const result = await exportLog.mutateAsync(filters);
      downloadTextFile(result.filename, result.csv);
      const message = `Logboek gedownload (${result.rowCount} regels).`;
      toast.success(message);
      announce(message);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Logboek docenthandelingen"
        description="Wie heeft wanneer welke leerlinggegevens bekeken of gewijzigd. Dit logboek kan niet worden aangepast."
        backHref={routes.docent.privacy}
        backLabel="Privacy & gegevens"
        actions={
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={exportLog.isPending}
            aria-busy={exportLog.isPending}
          >
            {exportLog.isPending ? (
              <Loader2
                className="motion-safe:animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Download aria-hidden="true" />
            )}
            Exporteren (CSV)
          </Button>
        }
      />

      <section
        aria-labelledby={`${id}-filters`}
        className="flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-5"
      >
        <div className="flex items-center justify-between gap-3">
          <h2
            id={`${id}-filters`}
            className="flex items-center gap-2 text-sm font-semibold"
          >
            <Filter
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
            Filters
          </h2>
          {filtered ? (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              <X aria-hidden="true" />
              Filters wissen
            </Button>
          ) : null}
        </div>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <FormField label="Docent" htmlFor={`${id}-actor`}>
            <select
              id={`${id}-actor`}
              value={actorId}
              onChange={(e) => setActorId(e.target.value)}
              className={selectClass}
            >
              <option value="">Alle docenten</option>
              {(staff.data ?? []).map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </FormField>
          <FormField label="Leerling" htmlFor={`${id}-student`}>
            <StudentPicker
              id={`${id}-student`}
              value={student}
              onChange={setStudent}
              placeholder="Alle leerlingen"
              clearable
            />
          </FormField>
          <FormField label="Soort handeling" htmlFor={`${id}-kind`}>
            <select
              id={`${id}-kind`}
              value={kind}
              onChange={(e) => setKind(e.target.value)}
              className={selectClass}
            >
              <option value="">Alle handelingen</option>
              {(Object.keys(grouped) as AuditCategory[]).map((cat) => (
                <optgroup key={cat} label={AUDIT_CATEGORY_LABELS[cat]}>
                  <option value={`category:${cat}`}>
                    Alles bij {AUDIT_CATEGORY_LABELS[cat].toLowerCase()}
                  </option>
                  {grouped[cat].map((a) => (
                    <option key={a} value={`action:${a}`}>
                      {AUDIT_ACTIONS[a].label}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </FormField>
          <fieldset className="flex min-w-0 flex-col gap-2">
            <legend className="mb-2 text-sm leading-none font-medium">
              Periode
            </legend>
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`${id}-from`}
                  className="text-xs text-muted-foreground"
                >
                  Van
                </label>
                <Input
                  id={`${id}-from`}
                  type="date"
                  value={from}
                  max={to || undefined}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </div>
              <div className="flex flex-col gap-1">
                <label
                  htmlFor={`${id}-to`}
                  className="text-xs text-muted-foreground"
                >
                  Tot en met
                </label>
                <Input
                  id={`${id}-to`}
                  type="date"
                  value={to}
                  min={from || undefined}
                  onChange={(e) => setTo(e.target.value)}
                />
              </div>
            </div>
          </fieldset>
        </div>
        <p className="text-xs text-muted-foreground">
          Exporteren kan voor maximaal 31 dagen. Zonder periode krijg je de
          afgelopen 31 dagen.
        </p>
      </section>

      {log.isPending ? (
        <LoadingState variant="list" label="Logboek laden…" />
      ) : log.isError ? (
        <ErrorState error={log.error} onRetry={() => log.refetch()} />
      ) : rows.length === 0 ? (
        <EmptyBlock
          icon={ScrollText}
          title={
            filtered
              ? "Geen handelingen gevonden"
              : "Nog geen handelingen vastgelegd."
          }
          description={filtered ? "Pas de filters aan of wis ze." : undefined}
        />
      ) : (
        <>
          <p className="sr-only" aria-live="polite">
            {rows.length} regels getoond.
          </p>
          <AuditRows rows={rows} />
          {log.hasNextPage ? (
            <div className="flex justify-center">
              <Button
                variant="outline"
                onClick={() => log.fetchNextPage()}
                disabled={log.isFetchingNextPage}
                aria-busy={log.isFetchingNextPage}
              >
                {log.isFetchingNextPage ? (
                  <Loader2
                    className="motion-safe:animate-spin"
                    aria-hidden="true"
                  />
                ) : null}
                Meer laden
              </Button>
            </div>
          ) : (
            <p className="text-center text-xs text-muted-foreground">
              Einde van het logboek.
            </p>
          )}
        </>
      )}
    </div>
  );
}

function Subject({ row }: { row: Row }) {
  if (!row.subjectUserId && !row.subjectLabel) {
    return <span className="text-muted-foreground">—</span>;
  }
  if (row.subjectUserId && row.subjectIsStudent && row.subjectName) {
    return (
      <Link
        href={routes.docent.student(row.subjectUserId)}
        className="font-medium text-primary underline-offset-[3px] hover:underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {row.subjectName}
        {row.subjectLabel ? (
          <span className="text-muted-foreground"> ({row.subjectLabel})</span>
        ) : null}
      </Link>
    );
  }
  return (
    <span>
      {row.subjectDeleted
        ? (row.subjectLabel ?? "Leerling")
        : (row.subjectName ?? row.subjectLabel ?? "—")}
      {row.subjectDeleted ? (
        <span className="ml-1.5 inline-flex rounded-full bg-muted px-1.5 py-0.5 text-[0.7rem] font-medium text-muted-foreground">
          verwijderd
        </span>
      ) : null}
    </span>
  );
}

function Actor({ row }: { row: Row }) {
  return (
    <span className="flex flex-col">
      <span className="font-medium">{row.actorName ?? "—"}</span>
      {row.actorRole !== "admin" || row.impersonated ? (
        <span className="text-xs text-muted-foreground">
          {ACTOR_ROLE_LABELS[row.actorRole] ?? row.actorRole}
          {row.impersonated ? " · meegekeken" : ""}
        </span>
      ) : null}
    </span>
  );
}

function Action({ row }: { row: Row }) {
  return (
    <span className="flex flex-col items-start gap-1">
      <span>{row.label}</span>
      {row.category ? (
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[0.7rem] font-medium",
            CATEGORY_TONES[row.category],
          )}
        >
          {AUDIT_CATEGORY_LABELS[row.category]}
        </span>
      ) : null}
    </span>
  );
}

function When({ row }: { row: Row }) {
  return (
    <span className="flex flex-col">
      <RelativeTime date={row.createdAt} locale="nl-NL" />
      <span className="text-xs text-muted-foreground tabular-nums">
        {formatDateTime(row.createdAt)}
      </span>
    </span>
  );
}

function AuditRows({ rows }: { rows: Row[] }) {
  const caption = "Logboek docenthandelingen, nieuwste eerst";
  return (
    <>
      <div className="hidden overflow-hidden rounded-xl border bg-card shadow-xs md:block">
        <ScrollRegion label={caption}>
          <table className="w-full min-w-[820px] border-collapse text-left text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead className="bg-muted/50 text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Tijdstip
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Docent
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Handeling
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Betreft
                </th>
                <th scope="col" className="px-4 py-2.5 font-semibold">
                  Details
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-4 py-3 whitespace-nowrap">
                    <When row={r} />
                  </td>
                  <td className="px-4 py-3">
                    <Actor row={r} />
                  </td>
                  <td className="px-4 py-3">
                    <Action row={r} />
                  </td>
                  <td className="px-4 py-3">
                    <Subject row={r} />
                  </td>
                  <td className="max-w-[18rem] px-4 py-3 text-xs break-words text-muted-foreground">
                    {r.detailsText || (r.ipPrefix ? null : "—")}
                    {r.ipPrefix ? (
                      <span className="mt-0.5 block font-mono">
                        {r.ipPrefix}
                      </span>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      </div>
      <ul className="flex flex-col gap-3 md:hidden" aria-label={caption}>
        {rows.map((r) => (
          <li
            key={r.id}
            className="flex flex-col gap-2 rounded-xl border bg-card p-4"
          >
            <div className="flex items-start justify-between gap-3">
              <Action row={r} />
              <span className="shrink-0 text-right text-xs">
                <When row={r} />
              </span>
            </div>
            <dl className="grid grid-cols-[5.5rem_1fr] gap-x-3 gap-y-1 text-sm">
              <dt className="text-muted-foreground">Docent</dt>
              <dd>
                <Actor row={r} />
              </dd>
              <dt className="text-muted-foreground">Betreft</dt>
              <dd>
                <Subject row={r} />
              </dd>
              {r.detailsText ? (
                <>
                  <dt className="text-muted-foreground">Details</dt>
                  <dd className="text-xs break-words text-muted-foreground">
                    {r.detailsText}
                  </dd>
                </>
              ) : null}
            </dl>
          </li>
        ))}
      </ul>
    </>
  );
}
