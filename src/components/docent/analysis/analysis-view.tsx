"use client";

import { useQuery } from "@tanstack/react-query";
import {
  Activity,
  ChartNoAxesColumn,
  ShieldCheck,
  Sigma,
  Users,
} from "lucide-react";
import { use, useId } from "react";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { EmptyBlock, ErrorState, LoadingState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { AssignmentNav } from "@/components/docent/assignments/assignment-nav";
import { Notice } from "@/components/docent/assignments/notice";
import { ModeBadge } from "@/components/docent/assignments/shared";
import { useDocumentTitle } from "@/lib/a11y/use-document-title";
import { SMALL_SAMPLE_MESSAGE } from "@/lib/analytics/flags";
import { routes } from "@/lib/routes";
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import { ChoiceDistribution } from "./choice-distribution";
import { CommonErrors } from "./common-errors";
import { formatShare, formatStat } from "./format";
import { ItemTable } from "./item-table";

type Analysis = RouterOutputs["analysis"]["assignment"];

export function AnalysisView({
  params,
}: {
  params: Promise<{ afnameId: string }>;
}) {
  const { afnameId } = use(params);
  const trpc = useTRPC();
  const query = useQuery(
    trpc.analysis.assignment.queryOptions({ assignmentId: afnameId }),
  );
  if (query.isPending) return <LoadingState />;
  if (query.isError)
    return (
      <ErrorState
        title="De toetsanalyse kon niet worden geladen"
        error={query.error}
        onRetry={() => query.refetch()}
      />
    );
  return <AnalysisContent data={query.data} />;
}

function AnalysisContent({ data }: { data: Analysis }) {
  const id = useId();
  const a = data.assignment;
  const t = data.test;
  useDocumentTitle([a.title, "Toetsanalyse"]);

  return (
    // grid-cols-1 (minmax(0, 1fr)): wide tables scroll inside their region
    // instead of widening the page on phones.
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        backHref={routes.docent.assignments}
        backLabel="Afnames"
        title={a.title}
        badge={
          <>
            <StatusBadge kind="assignment" status={a.effectiveStatus} />
            <ModeBadge mode={a.mode} />
          </>
        }
        description={`Toetsanalyse · ${a.className} · ${a.testTitle}`}
      />
      <AssignmentNav assignmentId={a.id} active="analysis" />

      {t.n === 0 ? (
        <EmptyBlock
          icon={ChartNoAxesColumn}
          title="Nog geen ingeleverde pogingen"
          description="Zodra leerlingen inleveren, zie je hier per vraag hoe moeilijk hij was en hoe goed hij sterke en zwakke leerlingen onderscheidt."
        />
      ) : (
        <>
          {t.smallSample ? (
            <Notice tone="info">{SMALL_SAMPLE_MESSAGE}</Notice>
          ) : null}
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard
              label="Gemiddelde score"
              value={`${formatStat(t.mean, 1)} / ${formatStat(t.maxTotal, 0)}`}
              icon={Sigma}
              tone="primary"
              hint={
                t.mean != null && t.maxTotal
                  ? `${formatShare(t.mean / t.maxTotal)} van de punten`
                  : undefined
              }
            />
            <StatCard
              label="Spreiding"
              value={formatStat(t.sd, 1)}
              icon={Activity}
              hint="standaarddeviatie in punten"
            />
            <StatCard
              label="Betrouwbaarheid (α)"
              value={formatStat(t.alpha)}
              icon={ShieldCheck}
              tone={
                t.alphaLevel?.tone === "success"
                  ? "success"
                  : t.alphaLevel?.tone === "warning"
                    ? "warning"
                    : "default"
              }
              hint={t.alphaLevel?.label ?? "te weinig gegevens"}
            />
            <StatCard
              label="Ingeleverd"
              value={`${t.n}/${t.students}`}
              icon={Users}
              hint={t.k === 1 ? "1 vraag telt mee" : `${t.k} vragen tellen mee`}
            />
          </div>

          <section
            aria-labelledby={`${id}-items`}
            className="flex flex-col gap-3"
          >
            <div>
              <h2 id={`${id}-items`} className="font-semibold">
                Per vraag
              </h2>
              <p className="text-sm text-muted-foreground">
                Een signaal is een aanwijzing, geen oordeel. Kijk bij een
                opvallende vraag naar de vraag zelf en naar het antwoordmodel.
              </p>
            </div>
            <ItemTable assignmentId={a.id} items={data.items} />
          </section>

          {data.codeErrors.length ? (
            <section
              aria-labelledby={`${id}-errors`}
              className="flex flex-col gap-3"
            >
              <h2 id={`${id}-errors`} className="font-semibold">
                Veelgemaakte fouten
              </h2>
              <CommonErrors questions={data.codeErrors} />
            </section>
          ) : null}

          {data.choices.length ? (
            <section
              aria-labelledby={`${id}-choices`}
              className="flex flex-col gap-3"
            >
              <h2 id={`${id}-choices`} className="font-semibold">
                Gekozen antwoorden
              </h2>
              <ChoiceDistribution questions={data.choices} />
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}
