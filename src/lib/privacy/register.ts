/**
 * Processing register (verwerkingsregister, AVG art. 30) and data inventory:
 * every database table belongs to exactly one data category. Shown on
 * /privacy, on /docent/privacy and exported as Markdown for the FG.
 * register.test.ts fails when a new table is not classified.
 * Pure module (no server or browser imports).
 */
import { formatDays, formatMonths } from "./retention";
import type { PrivacySettings } from "./settings";

export type DataSubject = "leerlingen" | "docenten";

export interface DataCategory {
  id: string;
  /** Dutch name, e.g. "Antwoorden en resultaten". */
  label: string;
  /** Which data, in plain Dutch. */
  examples: string;
  subjects: DataSubject[];
  purpose: string;
  legalBasis: string;
  /** Dutch retention description for the current settings. */
  retention: (settings: PrivacySettings) => string;
  /** Who can see the data. */
  recipients: string;
  /** Database tables this category owns (each table in exactly one). */
  tables: string[];
  /** Tables shared with another category (shown, not counted). */
  sharedTables?: string[];
}

const PUBLIC_TASK =
  "Taak van algemeen belang (AVG art. 6 lid 1 sub e), in samenhang met de WVO 2020";
const SECURITY =
  "Wettelijke verplichting tot beveiliging (AVG art. 6 lid 1 sub c, in samenhang met art. 32)";
const ACCOUNTABILITY =
  "Wettelijke verplichting (AVG art. 6 lid 1 sub c, in samenhang met art. 5 lid 2 en art. 32)";
const TEACHERS = "Docenten informatica van de school";
const TEACHERS_AND_STUDENT =
  "Docenten informatica van de school en de leerling zelf";
const PROCESSOR_NOTE =
  "; de beheerder van Pensuma alleen voor technisch onderhoud";

const inactive = (s: PrivacySettings) =>
  s.retention.autoDeleteAttempts && s.retention.confirmedAt
    ? `automatisch verwijderd ${formatMonths(s.retention.inactiveStudentMonths)} na de laatste keer inloggen, als de leerling in geen actieve klas meer zit`
    : `verwijderd door de school (bijvoorbeeld bij het afsluiten van het schooljaar); automatisch verwijderen na ${formatMonths(s.retention.inactiveStudentMonths)} zonder inloggen staat nog uit`;

export const DATA_CATEGORIES: readonly DataCategory[] = [
  {
    id: "student-account",
    label: "Accountgegevens leerling",
    examples:
      "Naam, leerlingnummer, pincode (alleen als hash opgeslagen), account actief of geblokkeerd",
    subjects: ["leerlingen"],
    purpose:
      "Inloggen en toetsen en resultaten aan de juiste leerling koppelen",
    legalBasis: PUBLIC_TASK,
    retention: (s) =>
      `Zolang de leerling Pensuma gebruikt; daarna ${inactive(s)}`,
    recipients: TEACHERS + PROCESSOR_NOTE,
    tables: ["user", "account"],
  },
  {
    id: "teacher-account",
    label: "Accountgegevens docent",
    examples: "Naam, e-mailadres van school, wachtwoord (alleen als hash)",
    subjects: ["docenten"],
    purpose: "Inloggen en beheer van klassen, toetsen en resultaten",
    legalBasis: PUBLIC_TASK,
    retention: () =>
      "Zolang de docent toegang heeft; een ander docentaccount verwijdert het account bij vertrek",
    recipients: `Andere docenten met toegang tot Pensuma${PROCESSOR_NOTE}`,
    tables: [],
    sharedTables: ["user", "account"],
  },
  {
    id: "student-pin",
    label: "Inlogcodes leerlingen",
    examples:
      "De pincode van de leerling, versleuteld met AES-256-GCM, zodat de docent inlogkaarten opnieuw kan afdrukken",
    subjects: ["leerlingen"],
    purpose: "Inlogkaarten opnieuw afdrukken zonder de pincode te wijzigen",
    legalBasis: PUBLIC_TASK,
    retention: () =>
      "Tot de pincode wordt vernieuwd of het leerlingaccount wordt verwijderd",
    recipients: TEACHERS,
    tables: ["student_pin"],
  },
  {
    id: "classes",
    label: "Klassen en klasindeling",
    examples: "Klasnaam, schooljaar, welke leerlingen in welke klas zitten",
    subjects: ["leerlingen"],
    purpose:
      "Toetsen klaarzetten voor een klas en resultaten per klas bekijken",
    legalBasis: PUBLIC_TASK,
    retention: () =>
      "Tot de school de klas verwijdert of het schooljaar afsluit (klassen worden dan gearchiveerd)",
    recipients: TEACHERS,
    tables: ["class", "class_member"],
  },
  {
    id: "results",
    label: "Antwoorden en resultaten",
    examples:
      "Ingeleverde code en antwoorden, uitkomst van de automatische tests, scores, cijfers en feedback van de docent, start- en inlevertijd",
    subjects: ["leerlingen"],
    purpose: "Toetsen afnemen, nakijken en terugkoppelen aan de leerling",
    legalBasis: PUBLIC_TASK,
    retention: (s) =>
      s.retention.autoDeleteAttempts && s.retention.confirmedAt
        ? `Automatisch verwijderd ${formatMonths(s.retention.attemptsMonths)} na het sluiten van de afname`
        : `Advies: ${formatMonths(s.retention.attemptsMonths)} na het sluiten van de afname. Automatisch verwijderen staat nog uit tot de school de bewaartermijnen vaststelt`,
    recipients: TEACHERS_AND_STUDENT + PROCESSOR_NOTE,
    tables: ["attempt", "answer"],
  },
  {
    id: "exam-log",
    label: "Logboek tijdens toetsen",
    examples:
      "Alleen als de docent dit aanzet: wanneer de leerling het toetsvenster of volledig scherm verlaat, pogingen om te plakken (zonder inhoud), code uitvoeren en testen",
    subjects: ["leerlingen"],
    purpose:
      "Een eerlijke toetsafname: de docent kan het gesprek aangaan als er iets opvalt",
    legalBasis: PUBLIC_TASK,
    retention: (s) =>
      `Automatisch verwijderd ${formatDays(s.retention.attemptEventsDays)} na het einde van de poging`,
    recipients: TEACHERS,
    tables: ["attempt_event"],
  },
  {
    id: "security",
    label: "Inlog- en beveiligingsgegevens",
    examples:
      "Sessies (met IP-adres en browser), tellers van mislukte inlogpogingen, tellers om te veel verzoeken af te remmen, tijdstip van de laatste keer inloggen",
    subjects: ["leerlingen", "docenten"],
    purpose: "Ingelogd blijven en het systeem beveiligen tegen misbruik",
    legalBasis: SECURITY,
    retention: () =>
      "Sessies zodra ze verlopen (12 uur na het laatste gebruik); tellers na 24 uur; de laatste keer inloggen zolang het account bestaat",
    recipients: "Alleen het systeem; de beheerder bij een beveiligingsincident",
    tables: [
      "session",
      "verification",
      "rate_limit",
      "login_throttle",
      "user_activity",
    ],
  },
  {
    id: "audit-log",
    label: "Logboek docenthandelingen",
    examples:
      "Welke docent wanneer welke leerlinggegevens heeft bekeken, gewijzigd, geëxporteerd of verwijderd (zonder inhoud), met een ingekort IP-adres; rapporten van de automatische opschoning",
    subjects: ["docenten", "leerlingen"],
    purpose:
      "Verantwoording en beveiliging: nagaan wie welke leerlinggegevens heeft ingezien of gewijzigd",
    legalBasis: ACCOUNTABILITY,
    retention: (s) =>
      `Automatisch verwijderd na ${formatMonths(s.retention.auditLogMonths)}`,
    recipients: `${TEACHERS} (alleen lezen; het logboek kan niet worden aangepast)`,
    tables: ["audit_log", "retention_run"],
  },
  {
    id: "privacy-admin",
    label: "Privacy-instellingen en bewaarblokkades",
    examples:
      "Contactgegevens van school, FG en beheerder, bewaartermijnen, bewaarblokkades met reden (bijvoorbeeld een bezwaarprocedure)",
    subjects: ["leerlingen", "docenten"],
    purpose:
      "De bewaartermijnen toepassen en gegevens langer bewaren als dat nodig is",
    legalBasis: ACCOUNTABILITY,
    retention: () =>
      "Instellingen zolang Pensuma in gebruik is; een bewaarblokkade tot de einddatum of tot de docent haar opheft",
    recipients: TEACHERS,
    tables: ["app_setting", "retention_hold"],
  },
  {
    id: "accommodations",
    label: "Faciliteiten bij toetsen",
    examples:
      "Alleen een percentage verlengde tijd en twee schakelaars (plakken toegestaan, geen logboek). Nooit een reden of diagnose",
    subjects: ["leerlingen"],
    purpose: "Leerlingen met een faciliteitenpas hun faciliteiten geven",
    legalBasis: PUBLIC_TASK,
    retention: () =>
      "Tot de docent de faciliteit uitzet of het leerlingaccount wordt verwijderd",
    recipients: TEACHERS,
    tables: ["student_accommodation"],
  },
  {
    id: "preferences",
    label: "Weergave-instellingen",
    examples: "Thema, lettergrootte en andere weergavekeuzes",
    subjects: ["leerlingen", "docenten"],
    purpose: "Pensuma prettig en toegankelijk weergeven",
    legalBasis: PUBLIC_TASK,
    retention: () => "Tot de gebruiker ze wijzigt of het account verdwijnt",
    recipients: "Alleen de gebruiker zelf",
    tables: ["user_preference"],
  },
  {
    id: "teaching-material",
    label: "Lesmateriaal en planning",
    examples:
      "Toetsen, vragen, afnames (met tijden en instellingen), voor welke leerlingen een inhaaltoets geldt, feedbackzinnen, vervallen vragen",
    subjects: ["docenten", "leerlingen"],
    purpose: "Toetsen maken, klaarzetten en nakijken",
    legalBasis: PUBLIC_TASK,
    retention: () =>
      "Zolang de school het lesmateriaal gebruikt; de koppeling aan leerlingen verdwijnt met het leerlingaccount",
    recipients: TEACHERS,
    tables: [
      "test",
      "question",
      "assignment",
      "assignment_student",
      "feedback_snippet",
      "question_neutralization",
    ],
  },
];

const SUBJECT_LABELS: Record<DataSubject, string> = {
  leerlingen: "Leerlingen",
  docenten: "Docenten",
};

export function formatSubjects(subjects: readonly DataSubject[]): string {
  return subjects.map((s) => SUBJECT_LABELS[s]).join(", ");
}

const orFallback = (value: string, fallback: string) =>
  value.trim() ? value.trim() : fallback;

/** Escape characters that would break a Markdown table cell. */
function cell(value: string): string {
  return value.replace(/\|/g, "\\|").replace(/\r?\n/g, " ");
}

/**
 * The register as Dutch Markdown (for the FG and the school's own
 * verwerkingsregister). `generatedAt` defaults to now.
 */
export function registerAsMarkdown(
  settings: PrivacySettings,
  generatedAt: Date = new Date(),
): string {
  const { school, dpo, processor } = settings;
  const unknown = "[[nog invullen]]";
  const date = generatedAt.toISOString().slice(0, 10);
  const lines: string[] = [
    "# Verwerkingsregister Pensuma",
    "",
    `Gegenereerd op ${date}. Dit overzicht volgt AVG artikel 30 en is bedoeld voor de functionaris gegevensbescherming (FG) en het verwerkingsregister van de school.`,
    "",
    "## Verantwoordelijke en contact",
    "",
    `- **Verwerkingsverantwoordelijke:** ${orFallback(school.authority, unknown)}${school.name.trim() ? ` (${school.name.trim()})` : ""}`,
    `- **Contact privacyvragen:** ${orFallback(school.privacyEmail, unknown)}`,
    `- **Functionaris gegevensbescherming:** ${orFallback(dpo.name, unknown)}${dpo.email ? ` (${dpo.email})` : ""}`,
    `- **Beheerder van Pensuma (verwerker):** ${orFallback(processor.name, unknown)}${processor.email ? ` (${processor.email})` : ""}`,
    `- **Locatie van de servers:** ${orFallback(processor.hostingLocation, unknown)}`,
    `- **Back-ups:** maximaal ${formatDays(processor.backupDays)} bewaard`,
    "- **Doorgifte buiten de EU:** geen",
    "- **Externe diensten (analytics, advertenties, CDN):** geen",
    "",
    "## Categorieën van gegevens",
    "",
    "| Categorie | Betrokkenen | Gegevens | Doel | Grondslag | Bewaartermijn | Ontvangers | Tabellen |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];
  for (const c of DATA_CATEGORIES) {
    const tables = [
      ...c.tables,
      ...(c.sharedTables ?? []).map((t) => `${t} (gedeeld)`),
    ].join(", ");
    lines.push(
      `| ${[
        c.label,
        formatSubjects(c.subjects),
        c.examples,
        c.purpose,
        c.legalBasis,
        c.retention(settings),
        c.recipients,
        tables,
      ]
        .map(cell)
        .join(" | ")} |`,
    );
  }
  lines.push(
    "",
    "## Beveiligingsmaatregelen",
    "",
    "- Wachtwoorden en pincodes alleen als hash opgeslagen; pincodes daarnaast versleuteld met AES-256-GCM voor het afdrukken van inlogkaarten.",
    "- Versleutelde verbinding (TLS) en strikte beveiligingsheaders (Content Security Policy).",
    "- Python-code wordt nagekeken in een afgeschermde omgeving (sandbox) zonder netwerk.",
    "- Logboek van docenthandelingen dat niet kan worden aangepast.",
    "- Automatische verwijdering volgens de bewaartermijnen; bewaarblokkades worden gerespecteerd.",
    "- Blokkade na herhaald mislukte inlogpogingen en afremmen van te veel verzoeken.",
    "",
    "_Dit is technische ondersteuning, geen juridisch advies. De school stelt de grondslag en de bewaartermijnen vast._",
    "",
  );
  return lines.join("\n");
}
