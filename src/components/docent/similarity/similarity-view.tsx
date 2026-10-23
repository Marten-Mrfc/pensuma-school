"use client";

import { useQuery } from "@tanstack/react-query";
import { Columns2, ScanSearch } from "lucide-react";
import { use, useId, useState } from "react";
import { ScrollRegion } from "@/components/a11y/scroll-region";
import { PageHeader } from "@/components/app/page-header";
import { EmptyBlock, ErrorState, LoadingState } from "@/components/app/states";
import { StatusBadge } from "@/components/app/status-badge";
import { AssignmentNav } from "@/components/docent/assignments/assignment-nav";
import { Notice } from "@/components/docent/assignments/notice";
import { ModeBadge } from "@/components/docent/assignments/shared";
import { Button } from "@/components/ui/button";
import { NumberField } from "@/components/ui/number-field";
import { NativeSelect } from "@/components/ui/select";
import { useDocumentTitle } from "@/lib/a11y/use-document-title";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import { pairFeatures, similarityLevel, similarityPercent } from "./labels";
import { type PairRef, PairSheet } from "./pair-sheet";

type Data = RouterOutputs["similarity"]["assignment"];
type Pair = Data["questions"][number]["pairs"][number];
type Side = Exclude<Pair["b"], { solution: true }>;

/** One recipe for every tag on this screen. */
const TAG =
  "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-sm px-2 text-xs font-medium whitespace-nowrap";

const LEVEL_CLASSES = {
  destructive: "bg-destructive/10 text-destructive-ink",
  warning: "bg-warning/15 text-warning-ink",
  info: "bg-info/12 text-info-ink",
} as const;

export function SimilarityView({
  params,
}: {
  params: Promise<{ afnameId: string }>;
}) {
  const { afnameId } = use(params);
  const trpc = useTRPC();
  const id = useId();
  const [questionId, setQuestionId] = useState("");
  const [scope, setScope] = useState<"assignment" | "test">("assignment");
  const [thresholdPct, setThresholdPct] = useState(70);
  const [pair, setPair] = useState<PairRef | null>(null);
  // Same afname header as the other tabs (cached when coming from one).
  const assignment = useQuery(
    trpc.assignment.get.queryOptions({ id: afnameId }),
  );
  const query = useQuery(
    trpc.similarity.assignment.queryOptions({
      assignmentId: afnameId,
      questionId: questionId || undefined,
      scope,
      threshold: thresholdPct / 100,
    }),
  );
  useDocumentTitle([query.data?.assignment.title, "Code vergelijken"]);

  const data = query.data;
  const rows =
    data?.questions
      .flatMap((q) => q.pairs.map((p) => ({ q, p })))
      .sort((x, y) => y.p.score - x.p.score || x.q.number - y.q.number) ?? [];
  const analyzed = data?.questions.reduce((s, q) => s + q.analyzed, 0) ?? 0;
  const skipped = data?.questions.reduce((s, q) => s + q.skippedShort, 0) ?? 0;

  return (
    // grid-cols-1 (minmax(0, 1fr)): wide tables scroll inside their region
    // instead of widening the page on phones.
    <div className="grid grid-cols-1 gap-6">
      <PageHeader
        backHref={routes.docent.assignments}
        backLabel="Afnames"
        title={
          assignment.data?.title ?? data?.assignment.title ?? "Code vergelijken"
        }
        badge={
          assignment.data ? (
            <>
              <StatusBadge
                kind="assignment"
                status={assignment.data.effectiveStatus}
              />
              <ModeBadge mode={assignment.data.mode} />
            </>
          ) : undefined
        }
        description={
          assignment.data
            ? `${assignment.data.class.name} · ${assignment.data.test.title}`
            : undefined
        }
      />
      <AssignmentNav assignmentId={afnameId} active="similarity" />

      <Notice tone="info">
        Een hoge overeenkomst is een signaal, geen bewijs. Korte opdrachten en
        voor de hand liggende oplossingen lijken vaak op elkaar. Bespreek het
        altijd eerst met de leerlingen.
      </Notice>

      <div className="grid gap-4 rounded-xl border bg-card p-4 shadow-xs sm:grid-cols-3">
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-question`} className="text-sm font-medium">
            Vraag
          </label>
          <NativeSelect
            id={`${id}-question`}
            value={questionId}
            onChange={(e) => setQuestionId(e.target.value)}
          >
            <option value="">Alle programmeervragen</option>
            {data?.codeQuestions.map((q) => (
              <option key={q.questionId} value={q.questionId}>
                V{q.number} {q.title}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-scope`} className="text-sm font-medium">
            Vergelijken met
          </label>
          <NativeSelect
            id={`${id}-scope`}
            value={scope}
            onChange={(e) => setScope(e.target.value as "assignment" | "test")}
          >
            <option value="assignment">Deze klas</option>
            <option value="test">Alle klassen met deze toets</option>
          </NativeSelect>
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-threshold`} className="text-sm font-medium">
            Drempel (%)
          </label>
          <NumberField
            id={`${id}-threshold`}
            value={thresholdPct}
            min={50}
            max={100}
            step={5}
            onValueChange={(v) =>
              v != null &&
              setThresholdPct(Math.min(100, Math.max(50, Math.round(v))))
            }
          />
        </div>
      </div>

      {query.isPending ? (
        <LoadingState variant="list" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !data || data.codeQuestions.length === 0 ? (
        <EmptyBlock
          icon={ScanSearch}
          title="Deze toets heeft geen programmeervragen"
          description="Code vergelijken werkt alleen bij programmeervragen."
        />
      ) : (
        <section
          aria-labelledby={`${id}-pairs`}
          className="flex flex-col gap-3"
        >
          <div>
            <h2 id={`${id}-pairs`} className="font-semibold">
              {rows.length === 0
                ? `Geen paren boven ${thresholdPct}%`
                : `${rows.length} ${rows.length === 1 ? "paar" : "paren"} boven ${thresholdPct}%`}
            </h2>
            <p className="text-sm text-muted-foreground">
              {analyzed} {analyzed === 1 ? "antwoord" : "antwoorden"} vergeleken
              {skipped
                ? `; ${skipped} ${skipped === 1 ? "antwoord was" : "antwoorden waren"} te kort om te vergelijken`
                : ""}
              {data.scope === "test"
                ? ` in ${data.afnameCount} ${data.afnameCount === 1 ? "afname" : "afnames"}`
                : ""}
              . Er wordt niets bewaard en leerlingen zien dit niet.
            </p>
          </div>
          {rows.length > 0 ? (
            <>
              {/* Phone: cards */}
              <ul className="flex flex-col gap-2 md:hidden">
                {rows.map(({ q, p }) => {
                  const level = similarityLevel(p.score);
                  const pasteCount =
                    p.a.pasteCount + ("solution" in p.b ? 0 : p.b.pasteCount);
                  const features = pairFeatures({
                    exact: p.exact,
                    identicalStructure: p.identicalStructure,
                    pasteCount,
                    withSolution: "solution" in p.b,
                  });
                  const bAnswerId =
                    "solution" in p.b ? "solution" : p.b.answerId;
                  const bName =
                    "solution" in p.b ? "Modeloplossing" : (p.b as Side).name;
                  return (
                    <li
                      key={`${q.questionId}:${p.a.answerId}:${bAnswerId}`}
                      className="flex flex-col gap-2.5 rounded-xl border bg-card p-4 shadow-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="min-w-0 text-xs text-muted-foreground">
                          <abbr
                            title={`Vraag ${q.number}`}
                            className="font-semibold text-foreground no-underline"
                          >
                            V{q.number}
                          </abbr>{" "}
                          {q.title}
                        </span>
                        <span className={cn(TAG, LEVEL_CLASSES[level.tone])}>
                          {level.label}
                          <span className="tabular-nums">
                            {similarityPercent(p.score)}
                          </span>
                        </span>
                      </div>
                      <p className="text-sm font-medium">
                        {p.a.name}{" "}
                        <span className="text-muted-foreground">en</span>{" "}
                        {bName}
                      </p>
                      {features.length ? (
                        <span className="flex flex-wrap gap-1">
                          {features.map((f) => (
                            <span
                              key={f}
                              className={cn(
                                TAG,
                                "bg-secondary text-secondary-foreground",
                              )}
                            >
                              {f}
                            </span>
                          ))}
                        </span>
                      ) : null}
                      <Button
                        variant="outline"
                        size="sm"
                        className="self-start"
                        onClick={() =>
                          setPair({
                            answerIdA: p.a.answerId,
                            answerIdB: bAnswerId,
                            pasteCount,
                          })
                        }
                        aria-label={`Naast elkaar: ${p.a.name} en ${"solution" in p.b ? "de modeloplossing" : bName}, vraag ${q.number}`}
                      >
                        <Columns2 aria-hidden="true" />
                        Naast elkaar
                      </Button>
                    </li>
                  );
                })}
              </ul>
              {/* Desktop: table */}
              <ScrollRegion
                label="Opvallende overeenkomsten"
                className="relative hidden rounded-xl border bg-card shadow-xs md:block"
              >
                <table className="w-full text-sm">
                  <caption className="sr-only">
                    Opvallende overeenkomsten
                  </caption>
                  <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
                    <tr>
                      <th scope="col" className="px-3 py-2.5 font-medium">
                        Vraag
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-medium">
                        Leerling A
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-medium">
                        Leerling B
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-medium">
                        Overeenkomst
                      </th>
                      <th scope="col" className="px-3 py-2.5 font-medium">
                        Kenmerken
                      </th>
                      <th scope="col" className="px-3 py-2.5">
                        <span className="sr-only">Vergelijken</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {rows.map(({ q, p }) => {
                      const level = similarityLevel(p.score);
                      const withSolution = "solution" in p.b;
                      const pasteCount =
                        p.a.pasteCount +
                        ("solution" in p.b ? 0 : p.b.pasteCount);
                      const features = pairFeatures({
                        exact: p.exact,
                        identicalStructure: p.identicalStructure,
                        pasteCount,
                        withSolution,
                      });
                      const bAnswerId =
                        "solution" in p.b ? "solution" : p.b.answerId;
                      return (
                        <tr
                          key={`${q.questionId}:${p.a.answerId}:${bAnswerId}`}
                        >
                          <td className="px-3 py-3 whitespace-nowrap">
                            <abbr
                              title={`Vraag ${q.number}`}
                              className="font-semibold no-underline"
                            >
                              V{q.number}
                            </abbr>
                            <span className="block max-w-40 truncate text-xs text-muted-foreground">
                              {q.title}
                            </span>
                          </td>
                          <th
                            scope="row"
                            className="px-3 py-3 text-left font-normal"
                          >
                            <StudentName
                              side={p.a}
                              showClass={data.scope === "test"}
                            />
                          </th>
                          <td className="px-3 py-3">
                            {"solution" in p.b ? (
                              <span className="font-medium">
                                Modeloplossing
                              </span>
                            ) : (
                              <StudentName
                                side={p.b as Side}
                                showClass={data.scope === "test"}
                              />
                            )}
                          </td>
                          <td className="px-3 py-3 whitespace-nowrap">
                            <span
                              className={cn(TAG, LEVEL_CLASSES[level.tone])}
                            >
                              {level.label}
                              <span className="tabular-nums">
                                {similarityPercent(p.score)}
                              </span>
                            </span>
                          </td>
                          <td className="px-3 py-3">
                            <span className="flex flex-wrap gap-1">
                              {features.map((f) => (
                                <span
                                  key={f}
                                  className={cn(
                                    TAG,
                                    "bg-secondary text-secondary-foreground",
                                  )}
                                >
                                  {f}
                                </span>
                              ))}
                              {!features.length ? (
                                <span className="text-xs text-muted-foreground">
                                  –
                                </span>
                              ) : null}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-right">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() =>
                                setPair({
                                  answerIdA: p.a.answerId,
                                  answerIdB: bAnswerId,
                                  pasteCount,
                                })
                              }
                              aria-label={`Naast elkaar: ${p.a.name} en ${"solution" in p.b ? "de modeloplossing" : (p.b as Side).name}, vraag ${q.number}`}
                            >
                              <Columns2 aria-hidden="true" />
                              Naast elkaar
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </ScrollRegion>
            </>
          ) : null}
        </section>
      )}

      <PairSheet pair={pair} onOpenChange={(o) => !o && setPair(null)} />
    </div>
  );
}

function StudentName({ side, showClass }: { side: Side; showClass: boolean }) {
  return (
    <span className="flex flex-col">
      <span className="font-medium whitespace-nowrap">{side.name}</span>
      <span className="text-xs text-muted-foreground tabular-nums">
        {side.studentNumber ?? "–"}
        {showClass ? ` · ${side.className}` : ""}
      </span>
    </span>
  );
}
