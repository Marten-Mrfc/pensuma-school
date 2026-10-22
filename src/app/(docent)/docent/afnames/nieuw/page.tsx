import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { AssignmentForm } from "@/components/docent/assignments/assignment-form";

export const metadata: Metadata = { title: "Afname plannen" };

export default function NewAssignmentPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <AssignmentForm />
    </Suspense>
  );
}
