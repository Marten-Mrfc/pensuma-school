"use client";

import { Search } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import {
  SimpleTable,
  type SimpleTableColumn,
} from "@/components/app/simple-table";
import { Input } from "@/components/ui/input";
import { routes } from "@/lib/routes";
import type { RouterOutputs } from "@/trpc/react";
import { formatDateTime } from "../students/format";
import { PinReveal } from "../students/pin-reveal";
import { StudentActionsMenu } from "../students/student-actions-menu";
import { StudentStatus } from "../students/student-status";

type Member = RouterOutputs["class"]["get"]["members"][number];

export interface ClassStudentsTableProps {
  classId: string;
  members: Member[];
}

/** Members of one class with PIN reveal and row actions. */
export function ClassStudentsTable({
  classId,
  members,
}: ClassStudentsTableProps) {
  const [filter, setFilter] = useState("");
  const term = filter.trim().toLowerCase();
  const rows = term
    ? members.filter(
        (m) =>
          m.name.toLowerCase().includes(term) ||
          m.studentNumber.startsWith(term),
      )
    : members;

  const columns: SimpleTableColumn<Member>[] = [
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
          </span>
        </div>
      ),
    },
    {
      key: "status",
      header: "Status",
      hideBelow: "sm",
      sortValue: (m) => (m.banned ? 1 : 0),
      cell: (m) => <StudentStatus banned={m.banned} />,
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
          student={{
            id: m.id,
            name: m.name,
            studentNumber: m.studentNumber,
            banned: m.banned,
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
