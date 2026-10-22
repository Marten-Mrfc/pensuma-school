"use client";

import "./globals.css";
import { useEffect } from "react";

/**
 * Last-resort error page. It replaces the root layout, so it brings its own
 * <html>/<body> and applies the saved theme itself.
 */
export default function GlobalError({
  error,
  retry,
  reset,
}: {
  error: unknown;
  retry?: () => void;
  reset?: () => void;
}) {
  useEffect(() => {
    console.error(error);
    try {
      const saved = localStorage.getItem("theme");
      const dark =
        saved === "dark" ||
        ((!saved || saved === "system") &&
          matchMedia("(prefers-color-scheme: dark)").matches);
      document.documentElement.classList.toggle("dark", dark);
    } catch {
      // ignore
    }
  }, [error]);

  const tryAgain = retry ?? reset;

  return (
    <html lang="nl">
      <body className="bg-background font-sans text-foreground">
        <title>Er ging iets mis · Pensuma</title>
        <main className="flex min-h-dvh flex-col items-center justify-center gap-6 px-5 text-center">
          <svg viewBox="0 0 32 32" className="size-12" aria-hidden="true">
            <rect width="32" height="32" rx="9" className="fill-primary" />
            <path
              d="M10.5 24V8.5L20 13.25L10.5 18"
              className="stroke-primary-foreground"
              strokeWidth="2.8"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
          <div className="flex max-w-md flex-col gap-2">
            <h1 className="text-2xl font-bold">
              Pensuma kon niet worden geladen
            </h1>
            <p className="text-muted-foreground">
              Er is een onverwachte fout opgetreden. Probeer het opnieuw of laad
              de pagina later nog eens.
            </p>
          </div>
          <div className="flex gap-3">
            {tryAgain ? (
              <button
                type="button"
                onClick={() => tryAgain()}
                className="h-10 rounded-md bg-primary px-5 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:outline-none"
              >
                Opnieuw proberen
              </button>
            ) : null}
            <a
              href="/"
              className="inline-flex h-10 items-center rounded-md border px-5 text-sm font-medium hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              Naar de startpagina
            </a>
          </div>
        </main>
      </body>
    </html>
  );
}
