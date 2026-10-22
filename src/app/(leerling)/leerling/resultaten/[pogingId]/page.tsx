import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { ResultPage } from "@/components/leerling/result-page";

export const metadata: Metadata = { title: "Resultaat" };

export default function ResultaatPage({
  params,
}: {
  params: Promise<{ pogingId: string }>;
}) {
  return (
    <Suspense fallback={<LoadingState />}>
      <ResultPage params={params} />
    </Suspense>
  );
}
