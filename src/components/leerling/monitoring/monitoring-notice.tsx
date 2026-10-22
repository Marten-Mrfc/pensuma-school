"use client";

import { useQuery } from "@tanstack/react-query";
import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import type { MonitoringSettings } from "@/lib/privacy/event-details";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";

export interface MonitoringNoticeProps {
  settings: MonitoringSettings;
  className?: string;
}

/**
 * Transparency (AVG art. 12–13): what this toets keeps track of, who can
 * see it and how long it is kept. A note, not an alert: it is shown
 * before starting and must not interrupt a screen reader.
 */
export function MonitoringNotice({
  settings,
  className,
}: MonitoringNoticeProps) {
  const titleId = useId();
  const trpc = useTRPC();
  const info = useQuery(
    trpc.privacy.publicInfo.queryOptions(undefined, {
      staleTime: 10 * 60_000,
    }),
  );
  const days = info.data?.retention.attemptEventsDays;
  const { logFocusEvents, requireFullscreen, blockPaste } = settings;

  const items: string[] = [];
  if (logFocusEvents) {
    items.push(
      "Wanneer je het toetsvenster verlaat of naar een ander tabblad gaat, en hoe lang.",
    );
  }
  if (requireFullscreen) items.push("Wanneer je het volledig scherm verlaat.");
  if (blockPaste || logFocusEvents) {
    items.push("Pogingen om te plakken (niet wát je plakt).");
  }
  items.push("Wanneer je je code uitvoert of test.");

  return (
    <section
      role="note"
      aria-labelledby={titleId}
      className={cn(
        "flex flex-col gap-3 rounded-xl border bg-muted/40 p-4 text-sm",
        className,
      )}
    >
      <h3
        id={titleId}
        className="flex items-center gap-2 font-display text-sm font-semibold"
      >
        {logFocusEvents || requireFullscreen ? (
          <Eye className="size-4 shrink-0 text-primary" aria-hidden="true" />
        ) : (
          <EyeOff
            className="size-4 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
        )}
        Dit wordt bijgehouden tijdens deze toets
      </h3>
      {!logFocusEvents && !requireFullscreen ? (
        <p className="leading-6 text-muted-foreground">
          Bij deze toets houden we niet bij of je naar andere tabbladen gaat.
        </p>
      ) : null}
      <ul className="flex list-disc flex-col gap-1 pl-5 leading-6 marker:text-muted-foreground">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
      <p className="leading-6 text-muted-foreground">
        Je docent kan dit logboek bekijken.{" "}
        {days
          ? `Het wordt na ${days} dagen automatisch verwijderd. `
          : "Het wordt na afloop automatisch verwijderd. "}
        <Link
          href={`${routes.privacy}#logboek`}
          className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
        >
          Lees meer in de privacyverklaring
        </Link>
      </p>
    </section>
  );
}
