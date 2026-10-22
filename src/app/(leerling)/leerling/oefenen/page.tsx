import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { PracticePlayground } from "@/components/leerling/practice-playground";

export const metadata: Metadata = { title: "Oefenen" };

export default function OefenenPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <PracticePlayground />
    </Suspense>
  );
}
