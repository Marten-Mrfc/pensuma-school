import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { TestBuilder } from "@/components/docent/tests/test-builder";

export const metadata: Metadata = { title: "Toets bewerken" };

export default function ToetsBuilderPage({
  params,
}: {
  params: Promise<{ toetsId: string }>;
}) {
  return (
    <Suspense fallback={<LoadingState label="Toets laden…" />}>
      <TestBuilder params={params} />
    </Suspense>
  );
}
