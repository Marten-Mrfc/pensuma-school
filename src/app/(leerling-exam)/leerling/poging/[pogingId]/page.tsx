import { Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { ExamPage } from "@/components/leerling/exam/exam-runner";

export default function PogingPage({ params }: { params: Promise<{ pogingId: string }> }) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-4xl px-4 py-10">
          <LoadingState label="Toets wordt geladen…" />
        </div>
      }
    >
      <ExamPage params={params} />
    </Suspense>
  );
}
