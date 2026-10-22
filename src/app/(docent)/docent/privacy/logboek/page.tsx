import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { AuditLogTable } from "@/components/docent/privacy/audit-log-table";

export const metadata: Metadata = { title: "Logboek docenthandelingen" };

export default function Page() {
  return (
    <Suspense fallback={<LoadingState />}>
      <AuditLogTable />
    </Suspense>
  );
}
