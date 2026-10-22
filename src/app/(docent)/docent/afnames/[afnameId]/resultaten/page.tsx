import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { ResultsView } from "@/components/docent/review/results-view";

export const metadata: Metadata = { title: "Resultaten" };

export default function AssignmentResultsPage({
  params,
}: {
  params: Promise<{ afnameId: string }>;
}) {
  return (
    <Suspense fallback={<LoadingState />}>
      <ResultsView params={params} />
    </Suspense>
  );
}
