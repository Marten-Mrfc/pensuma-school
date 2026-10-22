import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { ClassDetailPage } from "@/components/docent/classes/class-detail-page";

export const metadata: Metadata = { title: "Klas" };

export default function Page({
  params,
}: {
  params: Promise<{ klasId: string }>;
}) {
  return (
    <Suspense fallback={<LoadingState />}>
      <ClassDetailPage params={params} />
    </Suspense>
  );
}
