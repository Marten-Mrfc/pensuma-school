import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { MyData } from "@/components/leerling/privacy/my-data";

export const metadata: Metadata = { title: "Mijn gegevens" };

export default function Page() {
  return (
    <Suspense fallback={<LoadingState />}>
      <MyData />
    </Suspense>
  );
}
