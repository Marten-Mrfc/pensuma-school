"use client";

import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  ChevronLeft,
  ChevronRight,
  GraduationCap,
  Printer,
  Search,
  UserPlus,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import {
  SimpleTable,
  type SimpleTableColumn,
} from "@/components/app/simple-table";
import { EmptyBlock, ErrorState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NativeSelect } from "@/components/ui/select";
import { routes } from "@/lib/routes";
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import { formatDateTime, plural } from "./format";
import { PinDialog, type PinDialogStudent } from "./pin-dialog";
import { PinReveal } from "./pin-reveal";
import { StudentActionsMenu } from "./student-actions-menu";
import { StudentFormDialog } from "./student-form-dialog";
import { StudentStatus } from "./student-status";

type Row = RouterOutputs["student"]["list"]["rows"][number];
type Status = "all" | "active" | "inactive";

const PAGE_SIZE = 25;

/** /docent/leerlingen: all students, searchable and paginated. */
export function StudentsPage() {
  const trpc = useTRPC();
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [classId, setClassId] = useState("");
  const [status, setStatus] = useState<Status>("all");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [created, setCreated] = useState<PinDialogStudent | null>(null);

  useEffect(() => {
    const t = setTimeout(() => {
      setDebouncedSearch(search.trim());
      setPage(1);
    }, 250);
    return () => clearTimeout(t);
  }, [search]);

  const classesQuery = useQuery(
    trpc.class.list.queryOptions({ includeArchived: true }),
  );
  const query = useQuery({
    ...trpc.student.list.queryOptions({
      search: debouncedSearch || undefined,
      classId: classId || undefined,
      status,
      page,
      pageSize: PAGE_SIZE,
    }),
    placeholderData: keepPreviousData,
  });

  const data = query.data;
  // After deleting the last row of the last page, step back a page.
  useEffect(() => {
    if (data && data.page > data.pageCount) setPage(data.pageCount);
  }, [data]);
  const filtered = Boolean(debouncedSearch || classId || status !== "all");
  const from = data && data.total > 0 ? (data.page - 1) * data.pageSize + 1 : 0;
  const to = data ? Math.min(data.page * data.pageSize, data.total) : 0;
  const selectedClass = classesQuery.data?.find((c) => c.id === classId);

  const columns: SimpleTableColumn<Row>[] = [
    {
      key: "studentNumber",
      header: "Nummer",
      cell: (s) => (
        <span className="font-mono text-[0.8rem] tabular-nums">
          {s.studentNumber}
        </span>
      ),
      className: "w-24",
    },
    {
      key: "name",
      header: "Naam",
      cell: (s) => (
        <div className="flex min-w-0 flex-col">
          <Link
            href={routes.docent.student(s.id)}
            className="font-medium underline-offset-4 outline-none hover:underline focus-visible:underline"
          >
            {s.name}
          </Link>
          <span className="truncate text-xs text-muted-foreground md:hidden">
            {s.classes.length > 0
              ? s.classes.map((c) => c.name).join(", ")
              : "Geen klas"}
          </span>
        </div>
      ),
    },
    {
      key: "classes",
      header: "Klassen",
      hideBelow: "md",
      cell: (s) =>
        s.classes.length > 0 ? (
          <div className="flex flex-wrap gap-1">
            {s.classes.map((c) => (
              <Link
                key={c.id}
                href={routes.docent.class(c.id)}
                className="inline-flex h-6 items-center rounded-full bg-secondary px-2 text-xs font-medium text-secondary-foreground ring-1 ring-border ring-inset transition-colors hover:bg-accent data-[archived=true]:text-muted-foreground"
                data-archived={c.archived}
              >
                {c.name}
              </Link>
            ))}
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">Geen klas</span>
        ),
    },
    {
      key: "status",
      header: "Status",
      hideBelow: "lg",
      cell: (s) => <StudentStatus banned={s.banned} />,
    },
    {
      key: "pin",
      header: "Pincode",
      hideBelow: "sm",
      className: "whitespace-nowrap",
      cell: (s) => <PinReveal userId={s.id} hasPin={s.hasPin} />,
    },
    {
      key: "lastLoginAt",
      header: "Laatst ingelogd",
      hideBelow: "lg",
      cell: (s) => (
        <span className="text-xs text-muted-foreground">
          {formatDateTime(s.lastLoginAt)}
        </span>
      ),
    },
    {
      key: "actions",
      header: <span className="sr-only">Acties</span>,
      align: "right",
      className: "w-12",
      cell: (s) => (
        <StudentActionsMenu
          showDetailsLink
          student={{
            id: s.id,
            name: s.name,
            studentNumber: s.studentNumber,
            banned: s.banned,
          }}
        />
      ),
    },
  ];

  return (
    <>
      <PageHeader
        title="Leerlingen"
        description={
          data
            ? filtered
              ? `${plural(data.total, "leerling", "leerlingen")} gevonden.`
              : `${plural(data.total, "leerling", "leerlingen")} in Pensuma.`
            : "Alle leerlingaccounts, met hun klassen en pincodes."
        }
        actions={
          <>
            {selectedClass ? (
              <Button variant="outline" asChild>
                <Link
                  href={routes.docent.classLoginCards(selectedClass.id)}
                  target="_blank"
                  rel="noopener"
                >
                  <Printer aria-hidden="true" />
                  Inlogkaarten {selectedClass.name}
                </Link>
              </Button>
            ) : null}
            <Button onClick={() => setCreating(true)}>
              <UserPlus aria-hidden="true" />
              Leerling toevoegen
            </Button>
          </>
        }
      />

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Zoek op naam of leerlingnummer"
          prefixIcon={<Search className="size-4 text-muted-foreground" />}
          aria-label="Zoek leerlingen"
          allowClear
          className="sm:max-w-sm"
        />
        <div className="grid grid-cols-2 gap-2 sm:flex sm:w-auto">
          <NativeSelect
            aria-label="Filter op klas"
            value={classId}
            onChange={(e) => {
              setClassId(e.target.value);
              setPage(1);
            }}
            className="sm:w-48"
          >
            <option value="">Alle klassen</option>
            {classesQuery.data?.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.archived ? " (gearchiveerd)" : ""}
              </option>
            ))}
          </NativeSelect>
          <NativeSelect
            aria-label="Filter op status"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as Status);
              setPage(1);
            }}
            className="sm:w-40"
          >
            <option value="all">Alle statussen</option>
            <option value="active">Actief</option>
            <option value="inactive">Gedeactiveerd</option>
          </NativeSelect>
        </div>
      </div>

      {query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : data && data.total === 0 && !filtered ? (
        <EmptyBlock
          icon={GraduationCap}
          title="Nog geen leerlingen"
          description="Voeg leerlingen toe via een klas (lijst plakken of CSV) of maak hier één leerling aan."
          action={
            <>
              <Button variant="outline" asChild>
                <Link href={routes.docent.classes}>Naar klassen</Link>
              </Button>
              <Button onClick={() => setCreating(true)}>
                <UserPlus aria-hidden="true" />
                Leerling toevoegen
              </Button>
            </>
          }
        />
      ) : (
        <div className="flex flex-col gap-3">
          <SimpleTable
            caption="Leerlingen"
            columns={columns}
            rows={data?.rows}
            loading={query.isLoading}
            emptyText="Geen leerlingen gevonden. Pas je zoekopdracht of filters aan."
            className={
              query.isFetching && !query.isLoading
                ? "opacity-80 transition-opacity"
                : undefined
            }
          />
          {data && data.total > 0 ? (
            <nav
              aria-label="Paginering"
              className="flex flex-col items-center justify-between gap-2 text-sm text-muted-foreground sm:flex-row"
            >
              <span className="tabular-nums">
                {from}–{to} van {data.total}
              </span>
              <div className="flex items-center gap-1">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  <ChevronLeft aria-hidden="true" />
                  Vorige
                </Button>
                <span className="px-2 tabular-nums">
                  Pagina {data.page} van {data.pageCount}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= data.pageCount}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Volgende
                  <ChevronRight aria-hidden="true" />
                </Button>
              </div>
            </nav>
          ) : null}
        </div>
      )}

      <StudentFormDialog
        open={creating}
        onOpenChange={setCreating}
        defaultClassId={classId || undefined}
        onCreated={setCreated}
      />
      <PinDialog
        open={created !== null}
        onOpenChange={(open) => !open && setCreated(null)}
        student={created}
        title="Leerling toegevoegd"
        description="Geef de leerling deze pincode of print een inlogkaart. Je kunt de pincode later altijd opnieuw bekijken."
      />
    </>
  );
}
