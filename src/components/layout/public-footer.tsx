import Link from "next/link";
import { LogoMark } from "@/components/app/logo";

/** Footer for public pages. */
export function PublicFooter() {
  return (
    <footer className="border-t">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-5 py-8 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="flex items-center gap-2.5">
          <LogoMark className="size-6" />
          <span>
            <span className="font-medium text-foreground">Pensuma</span> ·
            Python-toetsen voor het informatica-onderwijs
          </span>
        </div>
        <nav aria-label="Inloggen" className="flex gap-4">
          <Link href="/inloggen" className="hover:text-foreground">
            Leerlingen
          </Link>
          <Link href="/inloggen?rol=docent" className="hover:text-foreground">
            Docenten
          </Link>
        </nav>
      </div>
    </footer>
  );
}
