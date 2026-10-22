/**
 * Display helpers for audit log rows (viewer and CSV export).
 * Pure module.
 */
import {
  AUDIT_ACTIONS,
  type AuditAction,
  type AuditCategory,
} from "./audit-actions";

const DETAIL_LABELS: Record<string, string> = {
  path: "functie",
  via: "via",
  trigger: "aanleiding",
  kind: "soort",
  mode: "modus",
  source: "bron",
  fields: "velden",
  count: "aantal",
  changedKeys: "gewijzigd",
  changedKeysCount: "aantal wijzigingen",
  classes: "klassen",
  attempts: "pogingen",
  attemptsCount: "pogingen",
  answers: "antwoorden",
  events: "logboekregels",
  eventsCount: "logboekregels",
  students: "leerlingen",
  sessions: "sessies",
  archivedClasses: "klassen gearchiveerd",
  revokedCount: "sessies beëindigd",
  otherSessionsCount: "andere sessies beëindigd",
  failuresCount: "mislukte pogingen",
  rowCount: "regels",
  rows: "regels",
  from: "van",
  to: "tot en met",
  minutes: "minuten",
  windowMinutes: "periode (minuten)",
  threshold: "drempel",
  manualScore: "score",
  includeFocus: "met logboek",
  retentionConfirmed: "vastgesteld",
  restricted: "beperkt",
  passwordChangeRequired: "tijdelijk wachtwoord",
  extraTimePercent: "extra tijd (%)",
  allowPaste: "plakken toegestaan",
  ignoreFocusEvents: "geen logboek",
  // Retention run and year-end close.
  verification: "verificatiecodes",
  rateLimit: "afremtellers",
  loginThrottle: "inlogtellers",
  attemptEvents: "logboekregels toetsen",
  attemptsReset: "pogingen met gewist logboek",
  inactiveStudents: "leerlingaccounts",
  auditLog: "logboekregels docenten",
  retentionRuns: "opschoonrapporten",
  skippedByHold: "overgeslagen (bewaarblokkade)",
  archiveClasses: "klassen archiveren",
  deleteEvents: "logboeken verwijderen",
  deleteAttempts: "pogingen verwijderen",
  deleteLeavers: "vertrekkende leerlingen verwijderen",
  // "classIdsCount" and friends (from the generic mutation entry).
  classIdsCount: "klassen",
  studentIdsCount: "leerlingen",
  userIdsCount: "leerlingen",
  answerIdsCount: "antwoorden",
  questionIdsCount: "vragen",
  attemptIdsCount: "pogingen",
  assignmentIdsCount: "afnames",
  testIdsCount: "toetsen",
};

/** Dutch words for enum-like values, per key. */
const VALUE_LABELS: Record<string, Record<string, string>> = {
  via: {
    retention: "automatische opschoning",
    school_year: "schooljaar afsluiten",
  },
  trigger: {
    manual: "handmatig",
    schedule: "automatisch",
    cli: "beheerscript",
  },
  kind: {
    dispute: "bezwaar of beroep",
    exam_dossier: "examendossier",
    restriction: "beperking (AVG art. 18)",
  },
  mode: {
    exam: "toets",
    practice: "oefenen",
    full_points: "volle punten",
    drop: "vraag telt niet mee",
  },
};

/** Privacy settings paths in changedKeys ("retention.attemptsMonths"). */
const SETTING_LABELS: Record<string, string> = {
  "school.name": "naam school",
  "school.authority": "bevoegd gezag",
  "school.privacyEmail": "e-mail privacyvragen",
  "school.policyUrl": "privacyreglement",
  "dpo.name": "naam FG",
  "dpo.email": "e-mail FG",
  "processor.name": "naam beheerder",
  "processor.email": "e-mail beheerder",
  "processor.hostingLocation": "serverlocatie",
  "processor.backupDays": "bewaartermijn back-ups",
  "retention.attemptEventsDays": "termijn logboek toetsen",
  "retention.attemptsMonths": "termijn pogingen",
  "retention.inactiveStudentMonths": "termijn leerlingaccounts",
  "retention.auditLogMonths": "termijn logboek docenten",
  "retention.autoDeleteAttempts": "automatisch verwijderen",
  "retention.confirmedAt": "vastgesteld op",
  "retention.confirmedById": "vastgesteld door",
  "exports.includeFocusByDefault": "logboek standaard in export",
  "accessibility.contactEmail": "e-mail toegankelijkheid",
  "accessibility.statementDate": "datum toegankelijkheidsverklaring",
};

/** Keys that only repeat the subject or are internal. */
const HIDDEN = /^(id|ids|[a-z][A-Za-z]*Id|[a-z][A-Za-z]*Ids)$/;

function formatValue(key: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "boolean") return value ? "ja" : "nee";
  if (typeof value === "number") return value.toLocaleString("nl-NL");
  if (Array.isArray(value)) {
    return value
      .map((v) =>
        key === "changedKeys" ? (SETTING_LABELS[String(v)] ?? String(v)) : v,
      )
      .map(String)
      .join(", ");
  }
  if (typeof value === "string") return VALUE_LABELS[key]?.[value] ?? value;
  return null;
}

function labelOf(key: string, value: unknown): string {
  // A score change goes "van 2 naar 3"; a period "van … tot en met …".
  if (key === "to" && typeof value === "number") return "naar";
  return DETAIL_LABELS[key] ?? key;
}

/**
 * "pogingen: 3 · antwoorden: 12" — ids are left out (they are in the
 * subject column). Zero counts are left out for readability.
 */
export function formatAuditDetails(
  details: Record<string, unknown> | null | undefined,
  maxParts = 8,
): string {
  if (!details) return "";
  const parts: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    if (HIDDEN.test(key) || value === 0) continue;
    const text = formatValue(key, value);
    if (text == null || text === "") continue;
    parts.push(`${labelOf(key, value)}: ${text}`);
    if (parts.length >= maxParts) break;
  }
  return parts.join(" · ");
}

export function auditActionLabel(action: string): string {
  return Object.hasOwn(AUDIT_ACTIONS, action)
    ? AUDIT_ACTIONS[action as AuditAction].label
    : action;
}

export function auditActionCategory(action: string): AuditCategory | null {
  return Object.hasOwn(AUDIT_ACTIONS, action)
    ? AUDIT_ACTIONS[action as AuditAction].category
    : null;
}

/** Actions per category, in catalogue order (for the filter select). */
export function actionsByCategory(): Record<AuditCategory, AuditAction[]> {
  const out: Record<AuditCategory, AuditAction[]> = {
    auth: [],
    access: [],
    change: [],
    security: [],
    privacy: [],
  };
  for (const [action, meta] of Object.entries(AUDIT_ACTIONS)) {
    out[meta.category].push(action as AuditAction);
  }
  return out;
}

export const ACTOR_ROLE_LABELS: Record<string, string> = {
  admin: "Docent",
  student: "Leerling",
  system: "Systeem",
};
