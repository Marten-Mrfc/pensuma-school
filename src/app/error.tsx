"use client";

import { RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";
import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";

export default function RootError({
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
  }, [error]);

  const digest =
    error instanceof Error
      ? (error as Error & { digest?: string }).digest
      : undefined;
  const tryAgain = retry ?? reset;

  return (
    <main
      id="inhoud"
      tabIndex={-1}
      className="flex min-h-dvh flex-col items-center justify-center gap-8 px-5 py-16 text-center"
    >
      <Logo />
      <div className="flex max-w-md flex-col gap-2">
        <h1 className="font-display-wide text-3xl font-bold tracking-tight">
          Er ging iets mis
        </h1>
        <p className="text-muted-foreground">
          Er is een onverwachte fout opgetreden. Probeer het opnieuw. Blijft het
          misgaan, laat het dan weten aan je docent of beheerder.
        </p>
        {digest ? (
          <p className="font-mono text-xs text-muted-foreground">
            Foutcode: {digest}
          </p>
        ) : null}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        {tryAgain ? (
          <Button size="lg" onClick={() => tryAgain()}>
            <RotateCcw aria-hidden="true" />
            Opnieuw proberen
          </Button>
        ) : null}
        <Button asChild size="lg" variant="outline">
          <Link href="/">Naar de startpagina</Link>
        </Button>
      </div>
    </main>
  );
}
