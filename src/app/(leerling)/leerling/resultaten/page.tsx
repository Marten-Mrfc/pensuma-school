import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { ResultsList } from "@/components/leerling/results-list";

export const metadata: Metadata = { title: "Resultaten" };

export default function ResultatenPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ResultsList />
    </Suspense>
  );
}
