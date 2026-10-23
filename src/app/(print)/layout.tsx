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
 *
 * The wrapper is the target of the root skip link ("Naar de inhoud"). It is
 * a <div>, not a <main>: the print views render their own <main> (the
 * sheets), and landmarks must not nest.
 */
export default function PrintLayout({ children }: { children: ReactNode }) {
  return (
    <div
      id="inhoud"
      tabIndex={-1}
      className="flex flex-1 flex-col outline-none print:block"
    >
      <Suspense
        fallback={
          <div className="mx-auto w-full max-w-3xl p-6">
            <LoadingState variant="list" />
          </div>
        }
      >
        <AdminGate>{children}</AdminGate>
      </Suspense>
    </div>
  );
}

async function AdminGate({ children }: { children: ReactNode }) {
  await requireAdmin();
  return children;
}
