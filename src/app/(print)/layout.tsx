import type { Metadata } from "next";
import { type ReactNode, Suspense } from "react";
import { LoadingState } from "@/components/app/states";
import { requireAdmin } from "@/server/session";
import "./print.css";

export const metadata: Metadata = {
  title: { default: "Afdrukken", template: "%s · Pensuma" },
  robots: { index: false, follow: false },
};

/**
 * Print pages (login cards) live outside the app shell. Teachers only: the
 * session is checked inside <Suspense> (request-time data).
 */
export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-3xl p-6">
          <LoadingState variant="list" />
        </div>
      }
    >
      <AdminGate>{children}</AdminGate>
    </Suspense>
  );
}

async function AdminGate({ children }: { children: ReactNode }) {
  await requireAdmin();
  return children;
}
