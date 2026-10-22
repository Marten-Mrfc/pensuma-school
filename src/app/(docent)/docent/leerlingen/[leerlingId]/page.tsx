import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { StudentDetailPage } from "@/components/docent/students/student-detail-page";

export const metadata: Metadata = { title: "Leerling" };

export default function Page({
  params,
}: {
  params: Promise<{ leerlingId: string }>;
}) {
  return (
    <Suspense fallback={<LoadingState />}>
      <StudentDetailPage params={params} />
    </Suspense>
  );
}
