import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { AssignmentMonitor } from "@/components/docent/assignments/assignment-monitor";

export const metadata: Metadata = { title: "Afname" };

export default function AssignmentPage({
  params,
}: {
  params: Promise<{ afnameId: string }>;
}) {
  return (
    <Suspense fallback={<LoadingState />}>
      <AssignmentMonitor params={params} />
    </Suspense>
  );
}
