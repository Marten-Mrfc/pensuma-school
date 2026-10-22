import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { StartScreen } from "@/components/leerling/start-screen";

export const metadata: Metadata = { title: "Toets starten" };

export default function AfnamePage({ params }: { params: Promise<{ afnameId: string }> }) {
  return (
    <Suspense fallback={<LoadingState />}>
      <StartScreen params={params} />
    </Suspense>
  );
}
