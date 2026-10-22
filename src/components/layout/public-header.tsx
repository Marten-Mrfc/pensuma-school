import Link from "next/link";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Button } from "@/components/ui/button";

/** Top bar for public pages (landing, 404). */
export function PublicHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-transparent bg-background/75 backdrop-blur-md supports-[backdrop-filter]:bg-background/60">
      <div className="mx-auto flex h-16 w-full max-w-6xl items-center gap-4 px-5 sm:px-8">
        <Logo />
        <nav
          aria-label="Pagina"
          className="ml-6 hidden items-center gap-1 text-sm md:flex"
        >
          <a
            href="#hoe-het-werkt"
            className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            Hoe het werkt
          </a>
          <a
            href="#nakijken"
            className="rounded-md px-3 py-1.5 text-muted-foreground transition-colors hover:text-foreground"
          >
            Eerlijk nakijken
          </a>
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <ThemeToggle />
          <Button asChild size="sm" className="ml-1">
            <Link href="/inloggen">Inloggen</Link>
          </Button>
        </div>
      </div>
    </header>
  );
}
