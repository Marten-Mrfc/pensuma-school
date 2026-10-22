import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { TestsPage } from "@/components/docent/tests/tests-page";

export const metadata: Metadata = { title: "Toetsen" };

export default function ToetsenPage() {
  return (
    <Suspense fallback={<LoadingState label="Toetsen laden…" />}>
      <TestsPage />
    </Suspense>
  );
}
