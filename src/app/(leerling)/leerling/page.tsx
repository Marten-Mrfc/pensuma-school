import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { StudentDashboard } from "@/components/leerling/dashboard";

export const metadata: Metadata = { title: "Mijn toetsen" };

export default function LeerlingDashboardPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <StudentDashboard />
    </Suspense>
  );
}
