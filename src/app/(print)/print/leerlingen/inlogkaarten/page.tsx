import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { LoginCardsView } from "@/components/docent/students/login-cards-view";
import { parseIdsParam } from "@/components/docent/students/parse-ids-param";

export const metadata: Metadata = { title: "Inlogkaarten" };

type Props = { searchParams: Promise<{ ids?: string | string[] }> };

export default function Page({ searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-3xl p-6">
          <LoadingState variant="list" />
        </div>
      }
    >
      <StudentLoginCards searchParams={searchParams} />
    </Suspense>
  );
}

async function StudentLoginCards({ searchParams }: Props) {
  const { ids } = await searchParams;
  return <LoginCardsView ids={parseIdsParam(ids)} />;
}
