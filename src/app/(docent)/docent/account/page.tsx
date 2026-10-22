import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { AccountPage } from "@/components/docent/staff/account-page";

export const metadata: Metadata = { title: "Account" };

export default function Page() {
  return (
    <Suspense fallback={<LoadingState />}>
      <AccountPage />
    </Suspense>
  );
}
