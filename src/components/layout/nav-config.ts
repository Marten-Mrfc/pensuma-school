import {
  Award,
  CalendarClock,
  FileCode2,
  GraduationCap,
  LayoutDashboard,
  type LucideIcon,
  NotebookPen,
  School,
  ShieldCheck,
  SquareTerminal,
  UsersRound,
} from "lucide-react";

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  /** Only highlight on an exact match (for section roots like /docent). */
  exact?: boolean;
};

export type NavGroup = { label: string; items: NavItem[] };

export const DOCENT_NAV: NavGroup[] = [
  {
    label: "Overzicht",
    items: [
      {
        href: "/docent",
        label: "Dashboard",
        icon: LayoutDashboard,
        exact: true,
      },
    ],
  },
  {
    label: "Lesgeven",
    items: [
      { href: "/docent/klassen", label: "Klassen", icon: School },
      { href: "/docent/leerlingen", label: "Leerlingen", icon: GraduationCap },
      { href: "/docent/toetsen", label: "Toetsen", icon: FileCode2 },
      { href: "/docent/afnames", label: "Afnames", icon: CalendarClock },
    ],
  },
  {
    label: "Beheer",
    items: [
      { href: "/docent/docenten", label: "Docenten", icon: UsersRound },
      {
        href: "/docent/privacy",
        label: "Privacy & gegevens",
        icon: ShieldCheck,
      },
    ],
  },
];

export const LEERLING_NAV: NavItem[] = [
  { href: "/leerling", label: "Mijn toetsen", icon: NotebookPen, exact: true },
  { href: "/leerling/resultaten", label: "Resultaten", icon: Award },
  { href: "/leerling/oefenen", label: "Oefenen", icon: SquareTerminal },
];

/**
 * Student pages reached from the account menu, not the main navigation:
 * no main item is highlighted there.
 */
export const LEERLING_ACCOUNT_PATHS = ["/leerling/mijn-gegevens"] as const;

function isUnder(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function isNavActive(item: NavItem, pathname: string | null): boolean {
  if (!pathname) return false;
  if (item.exact) return pathname === item.href;
  return isUnder(pathname, item.href);
}

/**
 * Student "Mijn toetsen" also covers deeper pages that are not
 * results/practice (an afname, a poging), except the account pages.
 */
export function isLeerlingNavActive(
  item: NavItem,
  pathname: string | null,
): boolean {
  if (!pathname) return false;
  if (item.href === "/leerling") {
    if (LEERLING_ACCOUNT_PATHS.some((p) => isUnder(pathname, p))) return false;
    return (
      isUnder(pathname, "/leerling") &&
      !LEERLING_NAV.some(
        (other) => other.href !== "/leerling" && isNavActive(other, pathname),
      )
    );
  }
  return isNavActive(item, pathname);
}
