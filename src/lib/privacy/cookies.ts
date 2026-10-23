/**
 * Cookies and browser storage used by Pensuma (Telecommunicatiewet 11.7a).
 * Only strictly necessary or functional items, so no consent banner is
 * needed; they are disclosed on /privacy. Pure module.
 *
 * Without HTTPS (development) the better-auth cookie names have no
 * "__Secure-" prefix. better-auth's session_data cookie (a cached copy of
 * the session) is switched off in src/server/auth.ts, so it is not listed.
 */

export type StorageKind = "cookie" | "lokale opslag";
export type StorageCategory = "noodzakelijk" | "functioneel";

export interface StorageItem {
  name: string;
  kind: StorageKind;
  category: StorageCategory;
  /** Who gets it, when not everybody (e.g. "alleen docenten"). */
  audience?: string;
  purpose: string;
  retention: string;
}

export const STORAGE_ITEMS: readonly StorageItem[] = [
  {
    name: "__Secure-better-auth.session_token",
    kind: "cookie",
    category: "noodzakelijk",
    purpose: "Ingelogd blijven",
    retention:
      "12 uur; voor leerlingen tot je uitlogt of de browser sluit (maximaal 12 uur geldig)",
  },
  {
    name: "better-auth.dont_remember",
    kind: "cookie",
    category: "noodzakelijk",
    audience: "alleen leerlingen",
    purpose: "Onthouden dat je sessie eindigt als je de browser sluit",
    retention: "tot je uitlogt of de browser sluit",
  },
  {
    name: "sidebar_state",
    kind: "cookie",
    category: "functioneel",
    audience: "alleen docenten",
    purpose: "Zijmenu open of dicht",
    retention: "7 dagen",
  },
  {
    name: "theme",
    kind: "lokale opslag",
    category: "functioneel",
    purpose: "Licht of donker thema",
    retention: "tot je het wijzigt",
  },
  {
    name: "pensuma:poging:…",
    kind: "lokale opslag",
    category: "noodzakelijk",
    audience: "alleen leerlingen",
    purpose: "Reservekopie van je antwoorden als de verbinding wegvalt",
    retention: "tot inleveren of uitloggen",
  },
  {
    name: "pensuma:prefs:…",
    kind: "lokale opslag",
    category: "functioneel",
    purpose: "Kopie van je weergave-instellingen",
    retention: "tot uitloggen",
  },
  {
    name: "pensuma:shortcuts",
    kind: "lokale opslag",
    category: "functioneel",
    purpose: "Of sneltoetsen aan of uit staan",
    retention: "tot je het wijzigt",
  },
  {
    name: "pensuma:oefenen:code",
    kind: "lokale opslag",
    category: "functioneel",
    audience: "alleen leerlingen",
    purpose: "Je code in de oefenomgeving bewaren",
    retention: "tot je de code wist",
  },
  {
    name: "pensuma:toetsen:filter",
    kind: "lokale opslag",
    category: "functioneel",
    audience: "alleen docenten",
    purpose: "Gekozen filter in het overzicht van toetsen",
    retention: "tot je het wijzigt",
  },
];

export const STORAGE_CATEGORY_LABELS: Record<StorageCategory, string> = {
  noodzakelijk: "Noodzakelijk",
  functioneel: "Functioneel",
};
