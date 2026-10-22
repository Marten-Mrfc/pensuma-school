import { describe, expect, test } from "bun:test";
import {
  DOCENT_NAV,
  isLeerlingNavActive,
  isNavActive,
  LEERLING_NAV,
  type NavItem,
} from "./nav-config";

const docentItem = (href: string): NavItem => {
  const item = DOCENT_NAV.flatMap((g) => g.items).find((i) => i.href === href);
  if (!item) throw new Error(`no docent nav item ${href}`);
  return item;
};
const leerlingItem = (href: string): NavItem => {
  const item = LEERLING_NAV.find((i) => i.href === href);
  if (!item) throw new Error(`no leerling nav item ${href}`);
  return item;
};

describe("DOCENT_NAV", () => {
  test("Beheer has Privacy & gegevens", () => {
    const beheer = DOCENT_NAV.find((g) => g.label === "Beheer");
    expect(beheer?.items.map((i) => i.label)).toContain("Privacy & gegevens");
    expect(docentItem("/docent/privacy").label).toBe("Privacy & gegevens");
  });

  test("hrefs are unique", () => {
    const hrefs = DOCENT_NAV.flatMap((g) => g.items).map((i) => i.href);
    expect(new Set(hrefs).size).toBe(hrefs.length);
  });
});

describe("isNavActive", () => {
  test("prefix match on segment boundaries", () => {
    const privacy = docentItem("/docent/privacy");
    expect(isNavActive(privacy, "/docent/privacy")).toBe(true);
    expect(isNavActive(privacy, "/docent/privacy/logboek")).toBe(true);
    expect(isNavActive(privacy, "/docent/privacyx")).toBe(false);
    expect(isNavActive(privacy, null)).toBe(false);
  });

  test("exact items only match themselves", () => {
    const dashboard = docentItem("/docent");
    expect(isNavActive(dashboard, "/docent")).toBe(true);
    expect(isNavActive(dashboard, "/docent/klassen")).toBe(false);
  });

  test("deeper pages highlight their section", () => {
    expect(
      isNavActive(
        docentItem("/docent/afnames"),
        "/docent/afnames/abc/nakijken",
      ),
    ).toBe(true);
    expect(
      isNavActive(docentItem("/docent/klassen"), "/docent/leerlingen"),
    ).toBe(false);
  });
});

describe("isLeerlingNavActive", () => {
  const home = leerlingItem("/leerling");
  const results = leerlingItem("/leerling/resultaten");
  const practice = leerlingItem("/leerling/oefenen");

  test("Mijn toetsen covers the dashboard and afname pages", () => {
    expect(isLeerlingNavActive(home, "/leerling")).toBe(true);
    expect(isLeerlingNavActive(home, "/leerling/afname/123")).toBe(true);
  });

  test("results and practice win over Mijn toetsen", () => {
    expect(isLeerlingNavActive(home, "/leerling/resultaten")).toBe(false);
    expect(isLeerlingNavActive(results, "/leerling/resultaten/9")).toBe(true);
    expect(isLeerlingNavActive(home, "/leerling/oefenen")).toBe(false);
    expect(isLeerlingNavActive(practice, "/leerling/oefenen")).toBe(true);
  });

  test("account pages highlight no main item", () => {
    for (const item of LEERLING_NAV) {
      expect(isLeerlingNavActive(item, "/leerling/mijn-gegevens")).toBe(false);
    }
  });

  test("other areas and null", () => {
    expect(isLeerlingNavActive(home, "/docent")).toBe(false);
    expect(isLeerlingNavActive(home, "/leerlingen")).toBe(false);
    expect(isLeerlingNavActive(home, null)).toBe(false);
  });
});
