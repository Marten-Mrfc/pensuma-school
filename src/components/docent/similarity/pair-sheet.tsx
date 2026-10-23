"use client";

import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Info } from "lucide-react";
import Link from "next/link";
import { ErrorState, LoadingState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { routes } from "@/lib/routes";
import { useTRPC } from "@/trpc/react";
import { useDialogReturnFocus } from "../assignments/use-dialog-return-focus";
import { pairFeatures, similarityLevel, similarityPercent } from "./labels";
import { SideBySideCode } from "./side-by-side-code";

export type PairRef = {
  answerIdA: string;
  answerIdB: string | "solution";
  pasteCount: number;
};

/** Wide right-hand sheet with both programs side by side. */
export function PairSheet({
  pair,
  onOpenChange,
}: {
  pair: PairRef | null;
  onOpenChange: (open: boolean) => void;
}) {
  const returnFocus = useDialogReturnFocus();
  return (
    <Sheet open={!!pair} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full gap-0 overflow-y-auto sm:max-w-5xl"
        {...returnFocus}
      >
        {pair ? <PairContent pair={pair} /> : null}
      </SheetContent>
    </Sheet>
  );
}

function PairContent({ pair }: { pair: PairRef }) {
  const trpc = useTRPC();
  const query = useQuery(
    trpc.similarity.pair.queryOptions({
      answerIdA: pair.answerIdA,
      answerIdB: pair.answerIdB,
    }),
  );
  if (query.isPending) {
    return (
      <>
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle>Naast elkaar</SheetTitle>
          <SheetDescription>Bezig met laden…</SheetDescription>
        </SheetHeader>
        <div className="p-6">
          <LoadingState variant="list" />
        </div>
      </>
    );
  }
  if (query.isError) {
    return (
      <>
        <SheetHeader className="border-b px-6 py-5">
          <SheetTitle>Naast elkaar</SheetTitle>
          <SheetDescription>Er ging iets mis.</SheetDescription>
        </SheetHeader>
        <div className="p-6">
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        </div>
      </>
    );
  }
  const d = query.data;
  const level = similarityLevel(d.score);
  const isSolution = "solution" in d.b;
  const features = pairFeatures({
    exact: d.exact,
    identicalStructure: d.identicalStructure,
    pasteCount: pair.pasteCount,
    withSolution: isSolution,
  });
  const sideTitle = (side: typeof d.a) => (
    <span className="flex flex-wrap items-center justify-between gap-2">
      <span>
        <span className="font-semibold">{side.name}</span>
        <span className="text-muted-foreground">
          {" "}
          · {side.studentNumber ?? "–"} · {side.className}
        </span>
      </span>
      <Button asChild variant="link" size="sm" className="h-auto p-0">
        <Link href={routes.docent.attempt(side.assignmentId, side.attemptId)}>
          Poging bekijken
          <ExternalLink aria-hidden="true" />
        </Link>
      </Button>
    </span>
  );

  return (
    <>
      <SheetHeader className="border-b px-6 py-5">
        <SheetTitle>
          V{d.question.number} · {d.question.title}
        </SheetTitle>
        <SheetDescription>
          {d.a.name} en {"solution" in d.b ? "de modeloplossing" : d.b.name}:{" "}
          {similarityPercent(d.score)} overeenkomst ({level.label.toLowerCase()}
          ).
        </SheetDescription>
        {features.length ? (
          <ul className="flex flex-wrap gap-1.5 pt-1">
            {features.map((f) => (
              <li
                key={f}
                className="inline-flex h-6 w-fit shrink-0 items-center rounded-sm bg-secondary px-2 text-xs font-medium whitespace-nowrap text-secondary-foreground"
              >
                {f}
              </li>
            ))}
          </ul>
        ) : null}
      </SheetHeader>
      <div className="flex flex-col gap-4 px-6 py-5">
        <p className="flex items-start gap-2 text-xs text-muted-foreground">
          <Info className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          Gemarkeerde regels (met een streep links) komen in beide programma's
          voor, los van namen en teksten. Startcode telt niet mee.
        </p>
        <SideBySideCode
          left={{
            title: sideTitle(d.a),
            code: d.a.code,
            matched: d.linesA,
            label: `Code van ${d.a.name}`,
          }}
          right={{
            title:
              "solution" in d.b ? (
                <span className="font-semibold">Modeloplossing</span>
              ) : (
                sideTitle(d.b)
              ),
            code: d.b.code,
            matched: d.linesB,
            label:
              "solution" in d.b ? "Modeloplossing" : `Code van ${d.b.name}`,
          }}
        />
      </div>
    </>
  );
}
