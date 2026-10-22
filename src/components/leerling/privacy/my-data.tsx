"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  Clock,
  Download,
  Eye,
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
import { formatDays, formatMonths } from "@/lib/privacy/retention";
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

/** /leerling/mijn-gegevens: what Pensuma stores about the student. */
export function MyData() {
  const trpc = useTRPC();
  const announce = useAnnounce();
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
    <PageHeader
      title="Mijn gegevens"
      description="Dit bewaart Pensuma over jou."
      actions={
        <Button
          onClick={handleDownload}
          disabled={exportMine.isPending || !query.data}
          aria-busy={exportMine.isPending}
        >
          {exportMine.isPending ? (
            <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
          ) : (
            <Download aria-hidden="true" />
          )}
          Download mijn gegevens
        </Button>
      }
    />
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
              <Fact label="Faciliteiten">
                {[
                  acc.extraTimePercent > 0
                    ? formatExtraTime(acc.extraTimePercent)
                    : null,
                  acc.allowPaste ? "plakken toegestaan" : null,
                  acc.ignoreFocusEvents ? "geen logboek" : null,
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </Fact>
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

        <Section icon={Eye} title="Wat we bijhouden tijdens toetsen">
          <p>
            Bij sommige toetsen houdt Pensuma bij wanneer je het toetsvenster
            verlaat, het volledige scherm verlaat of probeert te plakken. Dat
            zie je altijd vóórdat je begint. We houden nooit je toetsaanslagen,
            je scherm, je camera of wat je plakt bij.
          </p>
          <p>
            <Link href={`${routes.privacy}#logboek`} className={linkClass}>
              Lees meer over het logboek tijdens toetsen
            </Link>
          </p>
        </Section>

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
          {!r.confirmed ? (
            <p className="text-sm">
              Je school stelt deze termijnen nog definitief vast.
            </p>
          ) : null}
          <p>
            <Link href={routes.privacy} className={linkClass}>
              Lees de hele privacyverklaring
            </Link>
          </p>
        </Section>
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
