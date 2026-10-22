"use client";

import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";

/**
 * School-specific values in the accessibility statement, from
 * privacy.publicInfo (set by the school on /docent/privacy). The rest of
 * the statement is static and prerendered.
 */

/** Date of this version of the statement, used until the school sets one. */
export const DEFAULT_STATEMENT_DATE = "2026-10-22";

function usePublicInfo() {
  const trpc = useTRPC();
  return useQuery(
    trpc.privacy.publicInfo.queryOptions(undefined, { staleTime: 5 * 60_000 }),
  );
}

/** Inline placeholder (a <span>: these values sit inside paragraphs). */
function InlineSkeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block h-[1em] w-24 translate-y-0.5 rounded-md bg-muted motion-safe:animate-pulse",
        className,
      )}
    />
  );
}

const dateFormat = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "UTC",
});

function parseIsoDate(iso: string): Date | null {
  const d = new Date(`${iso}T00:00:00Z`);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** "22 oktober 2026" (+ months). */
export function formatStatementDate(iso: string, addMonths = 0): string {
  const d = parseIsoDate(iso) ?? (parseIsoDate(DEFAULT_STATEMENT_DATE) as Date);
  if (addMonths) d.setUTCMonth(d.getUTCMonth() + addMonths);
  return dateFormat.format(d);
}

/**
 * The school's name; "Onze school" at the start of a sentence, "onze
 * school" inside one, when the school hasn't filled it in.
 */
export function SchoolName({ position }: { position: "start" | "inline" }) {
  const query = usePublicInfo();
  if (query.isPending) return <InlineSkeleton className="w-28" />;
  const name = query.data?.school.name?.trim();
  if (name) return <>{name}</>;
  return <>{position === "start" ? "Onze school" : "onze school"}</>;
}

/** Statement date (or that date plus some months), formatted nl-NL. */
export function StatementDate({ addMonths = 0 }: { addMonths?: number }) {
  const query = usePublicInfo();
  if (query.isPending) return <InlineSkeleton className="w-32" />;
  const iso = query.data?.accessibility.statementDate ?? DEFAULT_STATEMENT_DATE;
  return <time dateTime={iso}>{formatStatementDate(iso, addMonths)}</time>;
}

/** "Loop je ergens tegenaan?": who to contact. Never renders an empty link. */
export function ContactInstructions() {
  const query = usePublicInfo();
  if (query.isPending) {
    return (
      <div className="flex flex-col gap-2" aria-hidden="true">
        <Skeleton className="h-5 w-4/5" />
        <Skeleton className="h-5 w-3/5" />
      </div>
    );
  }
  const email =
    query.data?.accessibility.contactEmail?.trim() ||
    query.data?.school.privacyEmail?.trim() ||
    "";
  if (!email) {
    return <p>Vraag je docent of de schooladministratie om hulp.</p>;
  }
  const link = (
    <a
      href={`mailto:${email}`}
      className="font-medium text-primary underline underline-offset-[3px] hover:no-underline"
    >
      {email}
    </a>
  );
  return (
    <ul className="ml-5 list-disc space-y-1.5 marker:text-primary/70">
      <li>Leerling: vertel het je docent, of mail naar {link}.</li>
      <li>Docent of ouder: mail naar {link}.</li>
    </ul>
  );
}
