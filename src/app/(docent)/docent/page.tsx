import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { DashboardView } from "@/components/docent/dashboard/dashboard-view";

export const metadata: Metadata = { title: "Dashboard" };

export default function DocentDashboardPage() {
  return (
    <Suspense fallback={<LoadingState />}>
      <DashboardView />
    </Suspense>
  );
}
