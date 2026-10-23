"use client";

import { useQuery } from "@tanstack/react-query";
import { Search, TimerReset, X } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  SimpleTable,
  type SimpleTableColumn,
} from "@/components/app/simple-table";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { routes } from "@/lib/routes";
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import { ExtraTimeDialog } from "../students/extra-time-dialog";
import { formatDateTime } from "../students/format";
import { PinReveal } from "../students/pin-reveal";
import { StudentActionsMenu } from "../students/student-actions-menu";
import {
  LoginLockBadge,
  RestrictedBadge,
  StudentStatus,
} from "../students/student-status";

type Member = RouterOutputs["class"]["get"]["members"][number];

/**
 * Query input for the class members whose processing may be restricted
 * (AVG art. 18). A restriction always deactivates the account, so only the
 * deactivated members need checking; `class.get` doesn't say it itself.
 */
export function restrictedMembersInput(classId: string) {
  return { classId, status: "inactive" as const, pageSize: 100 };
}

export interface ClassStudentsTableProps {
  classId: string;
  members: Member[];
}

/** Members of one class with PIN reveal and row actions. */
export function ClassStudentsTable({
  classId,
  members,
}: ClassStudentsTableProps) {
  const trpc = useTRPC();
  const [filter, setFilter] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const [bulkOpen, setBulkOpen] = useState(false);
  const accommodations = useQuery(
    trpc.accommodation.listForClass.queryOptions({ classId }),
  );
  const extraTime = (userId: string) =>
    accommodations.data?.[userId]?.extraTimePercent ?? 0;
  const inactiveMembers = useQuery({
    ...trpc.student.list.queryOptions(restrictedMembersInput(classId)),
    enabled: members.some((m) => m.banned),
  });
  const restrictedIds = new Set(
    (inactiveMembers.data?.rows ?? [])
      .filter((r) => r.restricted)
      .map((r) => r.id),
  );
  const memberIds = new Set(members.map((m) => m.id));
  const selection = selected.filter((x) => memberIds.has(x));
  const term = filter.trim().toLowerCase();
  const rows = term
    ? members.filter(
        (m) =>
          m.name.toLowerCase().includes(term) ||
          m.studentNumber.startsWith(term),
      )
    : members;

  const allShownSelected =
    rows.length > 0 && rows.every((m) => selection.includes(m.id));
  const toggle = (id: string, on: boolean) =>
    setSelected((list) =>
      on ? [...new Set([...list, id])] : list.filter((x) => x !== id),
    );

  const columns: SimpleTableColumn<Member>[] = [
    {
      key: "select",
      header: (
        <Checkbox
          checked={
            allShownSelected
              ? true
              : rows.some((m) => selection.includes(m.id))
                ? "indeterminate"
                : false
          }
          onCheckedChange={(v) =>
            setSelected((list) =>
              v === true
                ? [...new Set([...list, ...rows.map((m) => m.id)])]
                : list.filter((x) => !rows.some((m) => m.id === x)),
            )
          }
          aria-label="Alle leerlingen selecteren"
        />
      ),
      label: "Selecteren",
      className: "w-10",
      hideBelow: "sm",
      cell: (m) => (
        <Checkbox
          checked={selection.includes(m.id)}
          onCheckedChange={(v) => toggle(m.id, v === true)}
          aria-label={`${m.name} selecteren`}
        />
      ),
    },
    {
      key: "studentNumber",
      header: "Nummer",
      sortValue: (m) => m.studentNumber,
      cell: (m) => (
        <span className="font-mono text-[0.8rem] tabular-nums">
          {m.studentNumber}
        </span>
      ),
      className: "w-24",
      hideBelow: "sm",
    },
    {
      key: "name",
      header: "Naam",
      sortValue: (m) => m.name,
      cell: (m) => (
        <div className="flex min-w-0 flex-col">
          <Link
            href={routes.docent.student(m.id)}
            className="font-medium underline-offset-4 outline-none hover:underline focus-visible:underline"
          >
            {m.name}
          </Link>
          <span className="font-mono text-xs text-muted-foreground sm:hidden">
            {m.studentNumber}
            {m.banned ? " · gedeactiveerd" : ""}
            {extraTime(m.id) > 0 ? ` · +${extraTime(m.id)}% tijd` : ""}
          </span>
          <LoginLockBadge
            lockedUntil={m.loginLockedUntil}
            className="mt-1 sm:hidden"
          />
          <RestrictedBadge
            restricted={restrictedIds.has(m.id)}
            className="mt-1 sm:hidden"
          />
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      hideBelow: "sm",
      sortValue: (m) => (m.banned ? 1 : 0),
      cell: (m) => (
        <span className="flex flex-wrap items-center gap-1.5">
          <StudentStatus banned={m.banned} />
          <LoginLockBadge lockedUntil={m.loginLockedUntil} />
          <RestrictedBadge restricted={restrictedIds.has(m.id)} />
        </span>
      ),
    },
    {
      key: "extraTime",
      header: "Extra tijd",
      hideBelow: "sm",
      sortValue: (m) => extraTime(m.id),
      cell: (m) =>
        extraTime(m.id) > 0 ? (
          <span className="inline-flex h-6 items-center rounded-full bg-info/10 px-2 text-xs font-medium text-info-ink tabular-nums ring-1 ring-info/25 ring-inset">
            +{extraTime(m.id)}%
          </span>
        ) : (
          <span className="text-muted-foreground">
            <span aria-hidden="true">–</span>
            <span className="sr-only">Geen</span>
          </span>
        ),
    },
    {
      key: "pin",
      header: "Pincode",
      cell: (m) => <PinReveal userId={m.id} hasPin={m.hasPin} />,
      className: "whitespace-nowrap",
    },
    {
      key: "lastLoginAt",
      header: "Laatst ingelogd",
      hideBelow: "lg",
      sortValue: (m) => m.lastLoginAt,
      cell: (m) => (
        <span className="text-xs text-muted-foreground">
          {formatDateTime(m.lastLoginAt)}
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Acties</span>,
      align: "right",
      className: "w-12",
      cell: (m) => (
        <StudentActionsMenu
          classId={classId}
          showExtraTime
          student={{
            id: m.id,
            name: m.name,
            studentNumber: m.studentNumber,
            banned: m.banned,
            loginLockedUntil: m.loginLockedUntil,
            extraTimePercent: extraTime(m.id),
          }}
        />
      ),
    },
  ];

  return (
    <div className="flex flex-col gap-3">
      {members.length > 8 ? (
        <Input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Filter op naam of nummer"
          prefixIcon={<Search className="size-4 text-muted-foreground" />}
          aria-label="Filter leerlingen"
          allowClear
          className="sm:max-w-xs"
        />
      ) : null}
      {selection.length > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/40 px-3 py-2">
          <span className="text-sm font-medium" aria-live="polite">
            {selection.length}{" "}
            {selection.length === 1 ? "leerling" : "leerlingen"} geselecteerd
          </span>
          <Button size="sm" variant="outline" onClick={() => setBulkOpen(true)}>
            <TimerReset aria-hidden="true" />
            Verlengde tijd instellen…
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="ml-auto"
            onClick={() => setSelected([])}
          >
            <X aria-hidden="true" />
            Selectie wissen
          </Button>
        </div>
      ) : null}
      <ExtraTimeDialog
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        students={members
          .filter((m) => selection.includes(m.id))
          .map((m) => ({ id: m.id, name: m.name }))}
        initialPercent={
          selection.length === 1 ? extraTime(selection[0] ?? "") : 0
        }
        onSaved={() => setSelected([])}
      />
      <SimpleTable
        caption="Leerlingen in deze klas"
        columns={columns}
        rows={rows}
        emptyText={
          term
            ? "Geen leerlingen gevonden met dit filter."
            : "Nog geen leerlingen in deze klas."
        }
      />
    </div>
  );
}
