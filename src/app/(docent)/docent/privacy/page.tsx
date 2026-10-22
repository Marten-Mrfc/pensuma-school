import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { PrivacyAdminPage } from "@/components/docent/privacy/privacy-admin-page";

export const metadata: Metadata = { title: "Privacy & gegevens" };

export default function Page() {
  return (
    <Suspense fallback={<LoadingState />}>
      <PrivacyAdminPage />
    </Suspense>
  );
}
