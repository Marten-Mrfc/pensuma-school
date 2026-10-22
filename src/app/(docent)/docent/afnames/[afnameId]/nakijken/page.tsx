import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { GradingView } from "@/components/docent/review/grading-view";

export const metadata: Metadata = { title: "Nakijken" };

export default function AssignmentGradingPage({
  params,
}: {
  params: Promise<{ afnameId: string }>;
}) {
  return (
    <Suspense fallback={<LoadingState />}>
      <GradingView params={params} />
    </Suspense>
  );
}
