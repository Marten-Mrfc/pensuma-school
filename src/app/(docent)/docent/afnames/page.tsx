import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { AssignmentList } from "@/components/docent/assignments/assignment-list";

export const metadata: Metadata = { title: "Afnames" };

export default function AssignmentsPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <AssignmentList />
    </Suspense>
  );
}
