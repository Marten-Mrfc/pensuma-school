import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { AnalysisView } from "@/components/docent/analysis/analysis-view";

export const metadata: Metadata = { title: "Toetsanalyse" };

export default function AssignmentAnalysisPage({
  params,
}: {
  params: Promise<{ afnameId: string }>;
}) {
  return (
    <Suspense fallback={<LoadingState />}>
      <AnalysisView params={params} />
    </Suspense>
  );
}
