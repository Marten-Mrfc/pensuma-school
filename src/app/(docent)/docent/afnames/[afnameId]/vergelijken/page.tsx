import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { SimilarityView } from "@/components/docent/similarity/similarity-view";

export const metadata: Metadata = { title: "Code vergelijken" };

export default function AssignmentSimilarityPage({
  params,
}: {
  params: Promise<{ afnameId: string }>;
}) {
  return (
    <Suspense fallback={<LoadingState />}>
      <SimilarityView params={params} />
    </Suspense>
  );
}
