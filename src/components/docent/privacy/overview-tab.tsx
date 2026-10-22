"use client";

import { useQuery } from "@tanstack/react-query";
import {
  CalendarClock,
  ClipboardCheck,
  Eraser,
  FileWarning,
  Lock,
  ScrollText,
} from "lucide-react";
import { StatCard } from "@/components/app/stat-card";
import { ErrorState, LoadingState } from "@/components/app/states";
import { DataInventoryTable } from "@/components/privacy/data-inventory-table";
import { Button } from "@/components/ui/button";
import { RelativeTime } from "@/components/ui/relative-time";
import { useTRPC } from "@/trpc/react";
import { formatDate, plural } from "../students/format";
import { BreachCard } from "./breach-card";
import { Notice, PanelCard } from "./notice";
import type { PrivacyTab } from "./privacy-admin-page";

const nf = new Intl.NumberFormat("nl-NL");

export function OverviewTab({
  onNavigate,
}: {
  onNavigate: (tab: PrivacyTab) => void;
}) {
  const trpc = useTRPC();
  const overview = useQuery(trpc.privacy.overview.queryOptions());
  const settings = useQuery(trpc.privacy.getSettings.queryOptions());

  if (overview.isPending || settings.isPending) {
    return <LoadingState variant="page" label="Overzicht laden…" />;
  }
  if (overview.isError || settings.isError) {
    return (
      <ErrorState
        error={overview.error ?? settings.error}
        onRetry={() => {
          void overview.refetch();
          void settings.refetch();
        }}
      />
    );
  }

  const o = overview.data;
  const s = settings.data.settings;
  const confirmed = s.retention.confirmedAt != null;

  return (
    <>
      {!confirmed ? (
        <Notice
          tone="warning"
          title="Stel de bewaartermijnen vast"
          action={
            <Button size="sm" onClick={() => onNavigate("bewaartermijnen")}>
              <CalendarClock aria-hidden="true" />
              Bewaartermijnen instellen
            </Button>
          }
        >
          Pensuma verwijdert technische gegevens (sessies, inlogpogingen) en
          logboeken van toetsen al automatisch. Pogingen, antwoorden en oude
          leerlingaccounts worden pas automatisch verwijderd als jullie school
          de bewaartermijnen heeft vastgesteld. Overleg hierover met de
          functionaris gegevensbescherming (FG).
        </Notice>
      ) : null}

      <div className="grid grid-cols-[repeat(auto-fit,minmax(min(100%,13rem),1fr))] gap-4">
        <StatCard
          label="Bewaartermijnen"
          value={
            <span className="text-xl">
              {confirmed ? "Vastgesteld" : "Nog niet vastgesteld"}
            </span>
          }
          tone={confirmed ? "success" : "warning"}
          icon={ClipboardCheck}
          hint={
            confirmed
              ? `Op ${formatDate(s.retention.confirmedAt)}${
                  settings.data.confirmedByName
                    ? ` door ${settings.data.confirmedByName}`
                    : ""
                }`
              : "Pogingen worden nog niet automatisch verwijderd"
          }
        />
        <StatCard
          label="Laatste opschoning"
          value={
            o.lastRun ? (
              <RelativeTime
                date={o.lastRun.startedAt}
                locale="nl-NL"
                className="text-xl"
              />
            ) : (
              <span className="text-xl">Nog niet</span>
            )
          }
          icon={Eraser}
          tone={o.lastRun?.error ? "destructive" : "default"}
          hint={
            o.lastRun
              ? o.lastRun.error
                ? o.lastRun.error
                : `${nf.format(o.lastRun.deletedTotal)} ${o.lastRun.deletedTotal === 1 ? "regel" : "regels"} verwijderd`
              : "Draait automatisch elke 6 uur"
          }
        />
        <StatCard
          label="Logboekregels toetsen"
          value={nf.format(o.attemptEvents)}
          icon={ScrollText}
          tone="info"
          hint={`Na ${s.retention.attemptEventsDays} dagen automatisch verwijderd`}
        />
        <StatCard
          label="Bewaarblokkades"
          value={nf.format(o.holds)}
          icon={Lock}
          tone={o.holds > 0 ? "primary" : "default"}
          hint={
            o.holds > 0
              ? "Deze gegevens worden niet automatisch verwijderd"
              : "Geen actieve blokkades"
          }
        />
      </div>

      <PanelCard
        title="Wat staat er in Pensuma?"
        description="Aantallen op dit moment. Leerlingen zonder actieve klas worden verwijderd volgens de bewaartermijn, of bij het afsluiten van het schooljaar."
      >
        <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-6">
          {[
            ["Leerlingen", o.students],
            ["Zonder actieve klas", o.studentsWithoutActiveClass],
            ["Pogingen", o.attempts],
            ["Antwoorden", o.answers],
            ["Actieve sessies", o.activeSessions],
            ["Logboek docenten", o.auditEntries],
          ].map(([label, value]) => (
            <div key={label} className="flex flex-col gap-0.5">
              <dt className="text-xs text-muted-foreground">{label}</dt>
              <dd className="font-display text-xl font-semibold tabular-nums">
                {nf.format(Number(value))}
              </dd>
            </div>
          ))}
        </dl>
        {o.oldestAttemptAt ? (
          <p className="text-sm text-muted-foreground">
            De oudste poging is van {formatDate(o.oldestAttemptAt)}.
          </p>
        ) : null}
        {o.studentsWithoutActiveClass > 0 ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <FileWarning
              className="size-4 text-warning-ink"
              aria-hidden="true"
            />
            {plural(
              o.studentsWithoutActiveClass,
              "leerling zit",
              "leerlingen zitten",
            )}{" "}
            in geen enkele actieve klas.
          </p>
        ) : null}
      </PanelCard>

      <PanelCard
        title="Welke gegevens verwerkt Pensuma?"
        description="Dit overzicht staat ook in de privacyverklaring. De bewaartermijnen volgen jullie instellingen; de grondslag per soort gegevens staat in het verwerkingsregister."
      >
        <DataInventoryTable
          settings={s}
          caption="Gegevens in Pensuma, met doel en bewaartermijn"
        />
      </PanelCard>

      <BreachCard dpoEmail={s.dpo.email || null} />
    </>
  );
}
