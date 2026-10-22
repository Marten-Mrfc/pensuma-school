"use client";

import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarClock,
  CalendarPlus,
  ChevronRight,
  Clock,
  KeyRound,
  MoreHorizontal,
  NotebookPen,
  Radio,
  UserRoundCheck,
  Users,
} from "lucide-react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
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
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import { formatMinutes, formatWindow } from "./format";
import { SelectStudentsDialogById } from "./select-students-dialog";
import { AssignmentProgress, ModeBadge, TargetingBadges } from "./shared";

type Row = RouterOutputs["assignment"]["list"][number];
type Tab = "open" | "planned" | "closed";

const TABS: { value: Tab; label: string }[] = [
  { value: "open", label: "Open" },
  { value: "planned", label: "Gepland" },
  { value: "closed", label: "Gesloten" },
];

const EMPTY: Record<Tab, { title: string; description: string }> = {
  open: {
    title: "Er is nu geen afname open",
    description:
      "Plan een afname of open een geplande afname om leerlingen te laten beginnen.",
  },
  planned: {
    title: "Geen geplande afnames",
    description:
      "Plan een toets vooruit, dan gaat hij vanzelf open op het gekozen moment.",
  },
  closed: {
    title: "Nog geen gesloten afnames",
    description: "Afgeronde afnames met hun resultaten verschijnen hier.",
  },
};

export function AssignmentList() {
  const trpc = useTRPC();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = useQuery(
    trpc.assignment.list.queryOptions(undefined, { refetchInterval: 15_000 }),
  );

  const rows = query.data ?? [];
  const counts: Record<Tab, number> = {
    open: rows.filter((r) => r.effectiveStatus === "open").length,
    planned: rows.filter((r) => r.effectiveStatus === "planned").length,
    closed: rows.filter((r) => r.effectiveStatus === "closed").length,
  };
  const requested = searchParams.get("status");
  const tab: Tab =
    requested === "open" || requested === "planned" || requested === "closed"
      ? requested
      : counts.open === 0 && counts.planned > 0
        ? "planned"
        : "open";

  const setTab = (value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("status", value);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  const visible = rows.filter((r) => r.effectiveStatus === tab);

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="Afnames"
        description="Een afname is een toets voor één klas (of een paar leerlingen), met een eigen tijdvak, toegangscode en instellingen."
        actions={
          <Button asChild>
            <Link href={routes.docent.newAssignment()}>
              <CalendarPlus aria-hidden="true" />
              Afname plannen
            </Link>
          </Button>
        }
      />

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="w-full sm:w-fit">
          {TABS.map((t) => (
            <TabsTrigger key={t.value} value={t.value} className="gap-2 px-3">
              {t.label}
              <span
                className={cn(
                  "min-w-5 rounded-full px-1.5 text-[11px] leading-5 font-semibold tabular-nums",
                  t.value === tab
                    ? "bg-primary/10 text-primary"
                    : "bg-background/70 text-muted-foreground",
                )}
              >
                {counts[t.value]}
              </span>
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {query.isPending ? (
        <LoadingState variant="list" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : visible.length === 0 ? (
        <EmptyBlock
          icon={
            tab === "open"
              ? Radio
              : tab === "planned"
                ? CalendarClock
                : NotebookPen
          }
          title={EMPTY[tab].title}
          description={EMPTY[tab].description}
          action={
            <Button asChild variant={tab === "closed" ? "outline" : "default"}>
              <Link href={routes.docent.newAssignment()}>
                <CalendarPlus aria-hidden="true" />
                Afname plannen
              </Link>
            </Button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {visible.map((row) => (
            <AssignmentRow key={row.id} row={row} />
          ))}
        </ul>
      )}
    </div>
  );
}

function AssignmentRow({ row }: { row: Row }) {
  const href = routes.docent.assignment(row.id);
  const [choosingStudents, setChoosingStudents] = useState(false);
  const showProgress =
    row.effectiveStatus !== "planned" || row.counts.started > 0;
  return (
    <li className="group relative flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs transition-colors hover:border-primary/40 sm:p-5 lg:flex-row lg:items-center">
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge kind="assignment" status={row.effectiveStatus} />
          <ModeBadge mode={row.mode} />
          <TargetingBadges
            retakeOf={row.retakeOf}
            targetedStudentCount={row.targetedStudentCount}
          />
          {row.hasAccessCode ? (
            <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
              <KeyRound className="size-3.5" aria-hidden="true" />
              Code
            </span>
          ) : null}
        </div>
        <Link
          href={href}
          className="w-fit text-base font-semibold text-foreground outline-none after:absolute after:inset-0 after:rounded-xl after:content-[''] hover:text-primary focus-visible:after:ring-[3px] focus-visible:after:ring-ring/50"
        >
          {row.title}
        </Link>
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
          <span className="inline-flex items-center gap-1.5">
            <Users className="size-4" aria-hidden="true" />
            {row.className}
          </span>
          {row.customTitle && row.customTitle !== row.testTitle ? (
            <span className="truncate">{row.testTitle}</span>
          ) : null}
          <span className="inline-flex items-center gap-1.5">
            <CalendarClock className="size-4" aria-hidden="true" />
            {formatWindow(row.opensAt, row.closesAt)}
          </span>
          <span className="inline-flex items-center gap-1.5">
            <Clock className="size-4" aria-hidden="true" />
            {formatMinutes(row.timeLimitMinutes)}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-3 lg:w-80">
        {showProgress ? (
          <AssignmentProgress counts={row.counts} className="flex-1" />
        ) : (
          <p className="flex-1 text-sm text-muted-foreground">
            {row.counts.students} leerlingen · {row.questionCount} vragen
          </p>
        )}
        <div className="relative z-10 flex items-center">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                aria-label={`Acties voor ${row.title}`}
              >
                <MoreHorizontal aria-hidden="true" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem asChild>
                <Link href={href}>
                  <Radio aria-hidden="true" />
                  Live overzicht
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={routes.docent.assignmentResults(row.id)}>
                  <BarChart3 aria-hidden="true" />
                  Resultaten
                </Link>
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link href={routes.docent.assignmentGrading(row.id)}>
                  <NotebookPen aria-hidden="true" />
                  Nakijken
                </Link>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => setChoosingStudents(true)}>
                <UserRoundCheck aria-hidden="true" />
                Leerlingen kiezen…
              </DropdownMenuItem>
              <DropdownMenuItem asChild>
                <Link
                  href={routes.docent.newAssignment({
                    testId: row.testId,
                    classId: row.classId,
                  })}
                >
                  <CalendarPlus aria-hidden="true" />
                  Opnieuw plannen
                </Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <ChevronRight
            className="hidden size-5 text-muted-foreground transition-transform group-hover:translate-x-0.5 sm:block"
            aria-hidden="true"
          />
        </div>
      </div>
      <SelectStudentsDialogById
        assignmentId={row.id}
        open={choosingStudents}
        onOpenChange={setChoosingStudents}
      />
    </li>
  );
}
