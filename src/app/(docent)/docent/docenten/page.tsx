import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { StaffPage } from "@/components/docent/staff/staff-page";

export const metadata: Metadata = { title: "Docenten" };

export default function Page() {
  return (
    <Suspense fallback={<LoadingState />}>
      <StaffPage />
    </Suspense>
  );
}
