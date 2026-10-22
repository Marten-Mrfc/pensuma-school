import type { Metadata } from "next";
import Link from "next/link";
import { PublicFooter } from "@/components/layout/public-footer";
import { PublicHeader } from "@/components/layout/public-header";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = {
  title: "Pagina niet gevonden",
};

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <PublicHeader />
      <main className="relative flex flex-1 items-center justify-center px-5 py-20 sm:px-8">
        <div
          aria-hidden="true"
          className="bg-graph-paper absolute inset-0 -z-10 [mask-image:radial-gradient(ellipse_at_center,black_20%,transparent_70%)]"
        />
        <div className="flex max-w-lg flex-col items-center gap-6 text-center">
          <div className="overflow-hidden rounded-xl border bg-[var(--code-bg)] text-left font-mono text-[0.82rem] leading-6 shadow-lg shadow-black/[0.05]">
            <div className="border-b bg-muted/50 px-4 py-2 text-xs text-muted-foreground">
              Python
            </div>
            <div className="px-4 py-3">
              <div>
                <span className="text-[var(--code-function)]">open</span>
                <span className="text-[var(--code-punctuation)]">(</span>
                <span className="text-[var(--code-string)]">"deze-pagina"</span>
                <span className="text-[var(--code-punctuation)]">)</span>
              </div>
              <div className="text-destructive-ink">
                FileNotFoundError: pagina bestaat niet
              </div>
            </div>
          </div>
          <div className="flex flex-col gap-2">
            <h1 className="font-display-wide text-3xl font-bold tracking-tight text-balance sm:text-4xl">
              Deze pagina bestaat niet
            </h1>
            <p className="text-muted-foreground">
              Misschien is de link verouderd of zit er een typfout in het adres.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button asChild size="lg">
              <Link href="/">Naar de startpagina</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/inloggen">Inloggen</Link>
            </Button>
          </div>
        </div>
      </main>
      <PublicFooter />
    </div>
  );
}
