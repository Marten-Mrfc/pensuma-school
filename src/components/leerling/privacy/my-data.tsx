"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Clock,
  Download,
  Eye,
  FileJson,
  Loader2,
  type LucideIcon,
  NotebookPen,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { type ReactNode, useId } from "react";
import { toast } from "sonner";
import { useAnnounce } from "@/components/a11y/live-announcer";
import { getErrorMessage } from "@/components/app/get-error-message";
import { PageHeader } from "@/components/app/page-header";
import { ErrorState, LoadingState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { formatExtraTime } from "@/lib/accommodations";
import { downloadTextFile } from "@/lib/export/download";
import { myExportFileName } from "@/lib/privacy/export-format";
import { FACILITY_LABELS } from "@/lib/privacy/register";
import {
  autoDeleteNotice,
  formatDays,
  formatMonths,
} from "@/lib/privacy/retention";
import { routes } from "@/lib/routes";
import { useTRPC } from "@/trpc/react";
import { formatMoment } from "../format";

const linkClass =
  "font-medium text-primary underline underline-offset-[3px] hover:no-underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: LucideIcon;
  title: string;
  children: ReactNode;
}) {
  const id = useId();
  return (
    <section
      aria-labelledby={id}
      className="flex flex-col gap-4 rounded-2xl border bg-card p-5 shadow-xs sm:p-6"
    >
      <h2
        id={id}
        className="flex items-center gap-3 font-display text-lg font-semibold"
      >
        <span className="grid size-9 place-items-center rounded-xl bg-primary/10 text-primary">
          <Icon className="size-[18px]" aria-hidden="true" />
        </span>
        {title}
      </h2>
      <div className="flex flex-col gap-3 text-[0.95rem] leading-relaxed text-muted-foreground">
        {children}
      </div>
    </section>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b py-2.5 last:border-b-0 sm:flex-row sm:gap-4">
      <dt className="text-sm text-muted-foreground sm:w-40 sm:shrink-0">
        {label}
      </dt>
      <dd className="font-medium text-foreground">{children}</dd>
    </div>
  );
}

/** "50% verlengde tijd · plakken toegestaan", with the register's labels. */
export function facilitiesText(acc: {
  extraTimePercent: number;
  allowPaste: boolean;
  ignoreFocusEvents: boolean;
}): string {
  return [
    acc.extraTimePercent > 0 ? formatExtraTime(acc.extraTimePercent) : null,
    acc.allowPaste ? FACILITY_LABELS.allowPaste : null,
    acc.ignoreFocusEvents ? FACILITY_LABELS.ignoreFocusEvents : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * What the exam log records, in line with /privacy ("Het logboek tijdens
 * toetsen") and src/lib/privacy/event-details.ts: code runs and self-tests
 * always; leaving the window, leaving fullscreen and paste attempts only
 * when the toets asks for it; copying never.
 */
export function ExamLogSection() {
  return (
    <Section icon={Eye} title="Wat we bijhouden tijdens toetsen">
      <p>
        Bij elke toets, ook een oefentoets van je docent, houdt Pensuma bij
        wanneer je je code uitvoert of test: bij welke vraag, hoe lang het
        duurde, welke soort fout er was en hoeveel tests slaagden. Je code zelf
        staat daar niet in; die zit in je antwoord. Op de vrije oefenplek
        (Oefenen) komt niets in het logboek.
      </p>
      <p>
        Bij sommige toetsen houdt Pensuma daarnaast bij wanneer je het
        toetsvenster of tabblad verlaat, het volledige scherm verlaat of
        probeert te plakken (niet wát je plakt). Dat zie je altijd op het
        startscherm, voordat je begint.
      </p>
      <p>
        We houden nooit je toetsaanslagen, je scherm, camera of microfoon, wat
        je kopieert of wat je in andere tabbladen doet bij.
      </p>
      <p>
        <Link href={`${routes.privacy}#logboek`} className={linkClass}>
          Lees meer over het logboek tijdens toetsen
        </Link>
      </p>
    </Section>
  );
}

/** How long Pensuma keeps the student's data, with the school's caveat. */
export function RetentionSection({
  retention: r,
}: {
  retention: {
    attemptsMonths: number;
    attemptEventsDays: number;
    inactiveStudentMonths: number;
    confirmed: boolean;
    autoDeleteAttempts: boolean;
  };
}) {
  const notice = autoDeleteNotice(r);
  return (
    <Section icon={Clock} title="Hoe lang we dit bewaren">
      <ul className="ml-5 list-disc space-y-1.5 marker:text-primary">
        <li>
          Je antwoorden en resultaten:{" "}
          <strong className="text-foreground">
            {formatMonths(r.attemptsMonths)}
          </strong>{" "}
          na het sluiten van de toets.
        </li>
        <li>
          Het logboek tijdens toetsen:{" "}
          <strong className="text-foreground">
            {formatDays(r.attemptEventsDays)}
          </strong>{" "}
          na het inleveren.
        </li>
        <li>
          Je account: zolang je in een klas zit, daarna nog{" "}
          <strong className="text-foreground">
            {formatMonths(r.inactiveStudentMonths)}
          </strong>{" "}
          na de laatste keer inloggen.
        </li>
      </ul>
      {notice ? <p className="text-sm">{notice}</p> : null}
      <p>
        <Link href={routes.privacy} className={linkClass}>
          Lees de hele privacyverklaring
        </Link>
      </p>
    </Section>
  );
}

/** What the student gets from "Download mijn gegevens" (a JSON file). */
export const EXPORT_EXPLANATION =
  "Je krijgt een JSON-bestand: een vorm die vooral voor computers bedoeld is. Bovenin staat een onderdeel “uitleg” dat in gewone taal vertelt wat alles betekent; op deze pagina zie je dezelfde gegevens overzichtelijk.";

/** Under the page header, next to the download button it describes. */
export function DownloadExplanation({ id }: { id?: string }) {
  return (
    <p
      id={id}
      className="flex max-w-2xl items-start gap-2 text-sm text-pretty text-muted-foreground"
    >
      <FileJson className="mt-0.5 size-4 shrink-0" aria-hidden="true" />
      <span>{EXPORT_EXPLANATION}</span>
    </p>
  );
}

/** /leerling/mijn-gegevens: what Pensuma stores about the student. */
export function MyData() {
  const trpc = useTRPC();
  const announce = useAnnounce();
  const explanationId = useId();
  const query = useQuery(trpc.privacy.myData.queryOptions());
  const exportMine = useMutation(trpc.privacy.exportMyData.mutationOptions());

  async function handleDownload() {
    try {
      const data = await exportMine.mutateAsync();
      downloadTextFile(
        myExportFileName(),
        JSON.stringify(data, null, 2),
        "application/json;charset=utf-8",
      );
      const message = "Je gegevens zijn gedownload.";
      toast.success(message);
      announce(message);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  const header = (
    <div className="flex flex-col gap-2">
      <PageHeader
        title="Mijn gegevens"
        description="Dit bewaart Pensuma over jou."
        className="pb-0"
        actions={
          <Button
            onClick={handleDownload}
            disabled={exportMine.isPending || !query.data}
            aria-busy={exportMine.isPending}
            aria-describedby={explanationId}
          >
            {exportMine.isPending ? (
              <Loader2
                className="motion-safe:animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Download aria-hidden="true" />
            )}
            Download mijn gegevens
          </Button>
        }
      />
      <DownloadExplanation id={explanationId} />
    </div>
  );

  if (query.isPending) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <LoadingState variant="list" label="Je gegevens laden…" />
      </div>
    );
  }
  if (query.isError) {
    return (
      <div className="flex flex-col gap-6">
        {header}
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </div>
    );
  }

  const d = query.data;
  const r = d.privacy.retention;
  const email = d.privacy.school.privacyEmail;
  const acc = d.accommodation;

  return (
    <div className="flex flex-col gap-6">
      {header}
      <div className="grid gap-5 lg:grid-cols-2">
        <Section icon={UserRound} title="Over jou">
          <dl>
            <Fact label="Naam">{d.profile.name}</Fact>
            <Fact label="Leerlingnummer">
              <span className="tabular-nums">{d.profile.studentNumber}</span>
            </Fact>
            <Fact label="Klassen">
              {d.classes.length
                ? d.classes.map((c) => c.name).join(", ")
                : "Je zit nu in geen klas"}
            </Fact>
            <Fact label="Laatst ingelogd">
              {d.profile.lastSignInAt
                ? formatMoment(d.profile.lastSignInAt)
                : "Onbekend"}
            </Fact>
            {acc ? (
              <Fact label="Faciliteiten">{facilitiesText(acc)}</Fact>
            ) : null}
          </dl>
        </Section>

        <Section icon={NotebookPen} title="Je toetsen">
          <p>
            Je hebt{" "}
            <strong className="text-foreground">
              {d.attempts.submitted === 1
                ? "1 toets"
                : `${d.attempts.submitted} toetsen`}
            </strong>{" "}
            ingeleverd
            {d.attempts.submitted > 0
              ? `; van ${d.attempts.withResults === d.attempts.submitted ? "allemaal" : d.attempts.withResults} kun je de resultaten al zien`
              : ""}
            . Pensuma bewaart je antwoorden, je scores en de feedback van je
            docent.
          </p>
          <div>
            <Button variant="outline" asChild>
              <Link href={routes.leerling.results}>
                Naar je resultaten
                <ArrowRight aria-hidden="true" />
              </Link>
            </Button>
          </div>
        </Section>

        <ExamLogSection />

        <RetentionSection retention={r} />
      </div>

      <p className="rounded-2xl border border-primary/20 bg-primary/[0.04] px-5 py-4 text-[0.95rem] text-foreground">
        Klopt er iets niet? Vraag je docent om het te verbeteren. Je kunt ook
        mailen naar{" "}
        {email ? (
          <a href={`mailto:${email}`} className={linkClass}>
            {email}
          </a>
        ) : (
          "je school"
        )}
        .
      </p>
    </div>
  );
}
