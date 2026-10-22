import type { Metadata } from "next";
import { type ReactNode, Suspense } from "react";
import { CurrentUserProvider } from "@/components/app/current-user";
import { LoadingState } from "@/components/app/states";
import { toShellUser } from "@/components/layout/to-shell-user";
import { requireStudent } from "@/server/session";

export const metadata: Metadata = {
  title: "Toets",
};

/**
 * Distraction-free exam route: /leerling/poging/[pogingId].
 *
 * This lives in its own route group, (leerling-exam), so it does NOT inherit
 * the student navigation from (leerling)/leerling/layout.tsx. It only guards
 * the session (students only) and gives the page the full viewport. The page
 * renders its own chrome with <ExamShell> from "@/components/layout/exam-shell".
 */
export default function ExamLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-background">
      <Suspense
        fallback={
          <div className="mx-auto w-full max-w-4xl px-4 py-10">
            <LoadingState label="Toets wordt geladen…" />
          </div>
        }
      >
        <ExamGate>{children}</ExamGate>
      </Suspense>
    </div>
  );
}

async function ExamGate({ children }: { children: ReactNode }) {
  const user = await requireStudent();
  return (
    <CurrentUserProvider user={toShellUser(user)}>
      {children}
    </CurrentUserProvider>
  );
}
