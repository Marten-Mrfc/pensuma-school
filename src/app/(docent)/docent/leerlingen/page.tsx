import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { StudentsPage } from "@/components/docent/students/students-page";

export const metadata: Metadata = { title: "Leerlingen" };

export default function Page() {
  return (
    <Suspense fallback={<LoadingState />}>
      <StudentsPage />
    </Suspense>
  );
}
