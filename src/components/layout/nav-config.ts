import {
  Award,
  CalendarClock,
  FileCode2,
  GraduationCap,
  LayoutDashboard,
  type LucideIcon,
  NotebookPen,
  School,
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
    items: [{ href: "/docent/docenten", label: "Docenten", icon: UsersRound }],
  },
];

export const LEERLING_NAV: NavItem[] = [
  { href: "/leerling", label: "Mijn toetsen", icon: NotebookPen, exact: true },
  { href: "/leerling/resultaten", label: "Resultaten", icon: Award },
  { href: "/leerling/oefenen", label: "Oefenen", icon: SquareTerminal },
];

export function isNavActive(item: NavItem, pathname: string | null): boolean {
  if (!pathname) return false;
  if (item.exact) return pathname === item.href;
  return pathname === item.href || pathname.startsWith(`${item.href}/`);
}

/** Student "Mijn toetsen" also covers deeper pages that are not results/practice. */
export function isLeerlingNavActive(
  item: NavItem,
  pathname: string | null,
): boolean {
  if (!pathname) return false;
  if (item.href === "/leerling") {
    return (
      pathname.startsWith("/leerling") &&
      !LEERLING_NAV.some(
        (other) => other.href !== "/leerling" && isNavActive(other, pathname),
      )
    );
  }
  return isNavActive(item, pathname);
}
