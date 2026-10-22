import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { ClassesPage } from "@/components/docent/classes/classes-page";

export const metadata: Metadata = { title: "Klassen" };

export default function Page() {
  return (
    <Suspense fallback={<LoadingState />}>
      <ClassesPage />
    </Suspense>
  );
}
