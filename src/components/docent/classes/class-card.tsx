import { Archive, CalendarClock, ChevronRight, UsersRound } from "lucide-react";
import Link from "next/link";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import type { RouterOutputs } from "@/trpc/react";
import { plural } from "../students/format";

export type ClassListItem = RouterOutputs["class"]["list"][number];

/** Clickable class tile for the classes overview. */
export function ClassCard({ klas }: { klas: ClassListItem }) {
  const open = klas.openAssignmentCount;
  return (
    <Link
      href={routes.docent.class(klas.id)}
      data-slot="card"
      className={cn(
        "group relative flex flex-col gap-4 overflow-hidden rounded-xl border bg-card p-5 text-card-foreground shadow-xs transition-[box-shadow,transform,border-color] duration-150 outline-none hover:border-primary/30 focus-visible:ring-[3px] focus-visible:ring-ring/50",
        klas.archived && "bg-card/60",
      )}
    >
      <span
        aria-hidden="true"
        className={cn(
          "absolute inset-x-0 top-0 h-[3px]",
          klas.archived
            ? "bg-border"
            : open > 0
              ? "bg-success"
              : "bg-primary/60",
        )}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-1">
          <h2
            className={cn(
              "truncate font-display text-xl leading-tight font-bold tracking-tight",
              klas.archived && "text-muted-foreground",
            )}
          >
            {klas.name}
          </h2>
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
            {klas.schoolYear ? (
              <span>Schooljaar {klas.schoolYear}</span>
            ) : (
              <span>Geen schooljaar</span>
            )}
            {klas.archived ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 font-medium">
                <Archive className="size-3" aria-hidden="true" />
                Gearchiveerd
              </span>
            ) : null}
          </div>
        </div>
        <ChevronRight
          className="mt-1 size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5 group-hover:text-foreground"
          aria-hidden="true"
        />
      </div>

      {klas.description ? (
        <p className="line-clamp-2 text-sm text-pretty text-muted-foreground">
          {klas.description}
        </p>
      ) : null}

      <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-2 border-t pt-4 text-sm">
        <span className="inline-flex items-center gap-1.5">
          <UsersRound
            className="size-4 text-muted-foreground"
            aria-hidden="true"
          />
          <span className="font-medium tabular-nums">
            {plural(klas.studentCount, "leerling", "leerlingen")}
          </span>
        </span>
        <span className="inline-flex items-center gap-1.5">
          {open > 0 ? (
            <span className="relative flex size-2" aria-hidden="true">
              <span className="absolute inline-flex size-full rounded-full bg-success opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex size-2 rounded-full bg-success" />
            </span>
          ) : (
            <CalendarClock
              className="size-4 text-muted-foreground"
              aria-hidden="true"
            />
          )}
          <span
            className={cn(
              "tabular-nums",
              open > 0
                ? "font-medium text-success-ink"
                : "text-muted-foreground",
            )}
          >
            {open > 0
              ? `${open} open ${open === 1 ? "afname" : "afnames"}`
              : klas.plannedAssignmentCount > 0
                ? `${klas.plannedAssignmentCount} gepland`
                : klas.assignmentCount > 0
                  ? plural(klas.assignmentCount, "afname", "afnames")
                  : "Nog geen afnames"}
          </span>
        </span>
      </div>
    </Link>
  );
}
