import Link from "next/link";
import { LogoMark } from "@/components/app/logo";
import { routes } from "@/lib/routes";

const LINKS = [
  { href: routes.login, label: "Leerlingen" },
  { href: `${routes.login}?rol=docent`, label: "Docenten" },
  { href: routes.privacy, label: "Privacyverklaring" },
  { href: routes.accessibility, label: "Toegankelijkheid" },
];

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
        <nav aria-label="Voettekst">
          <ul className="flex flex-wrap gap-x-4 gap-y-1">
            {LINKS.map((link) => (
              <li key={link.href}>
                <Link
                  href={link.href}
                  className="inline-block rounded-sm py-1 underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
      </div>
    </footer>
  );
}
