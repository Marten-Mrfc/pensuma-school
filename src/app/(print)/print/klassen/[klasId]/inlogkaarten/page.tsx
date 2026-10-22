import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { LoginCardsView } from "@/components/docent/students/login-cards-view";
import { parseIdsParam } from "@/components/docent/students/parse-ids-param";

export const metadata: Metadata = { title: "Inlogkaarten" };

type Props = {
  params: Promise<{ klasId: string }>;
  searchParams: Promise<{ ids?: string | string[] }>;
};

export default function Page({ params, searchParams }: Props) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-3xl p-6">
          <LoadingState variant="list" />
        </div>
      }
    >
      <ClassLoginCards params={params} searchParams={searchParams} />
    </Suspense>
  );
}

async function ClassLoginCards({ params, searchParams }: Props) {
  const [{ klasId }, { ids }] = await Promise.all([params, searchParams]);
  return <LoginCardsView classId={klasId} ids={parseIdsParam(ids)} />;
}
