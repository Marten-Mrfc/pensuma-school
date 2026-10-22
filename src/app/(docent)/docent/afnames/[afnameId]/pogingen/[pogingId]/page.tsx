import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { AttemptReview } from "@/components/docent/review/attempt-review";

export const metadata: Metadata = { title: "Poging" };

export default function AttemptPage({
  params,
}: {
  params: Promise<{ afnameId: string; pogingId: string }>;
}) {
  return (
    <Suspense fallback={<LoadingState />}>
      <AttemptReview params={params} />
    </Suspense>
  );
}
