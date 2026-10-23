/**
 * Display helpers for audit log rows (viewer and CSV export).
 * Pure module.
 */
import { formatDateTimeNl } from "@/lib/export/csv";
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
  scope: "bereik",
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
  totalExtraMinutes: "extra tijd in totaal (minuten)",
  deadlineAt: "eindtijd",
  windowMinutes: "periode (minuten)",
  threshold: "drempel",
  manualScore: "score",
  includeFocus: "met logboek",
  retentionConfirmed: "vastgesteld",
  restricted: "beperkt",
  bulk: "meerdere tegelijk",
  skippedRestricted: "overgeslagen (beperking AVG art. 18)",
  restrictedRows: "zonder resultaten (beperking AVG art. 18)",
  passwordChangeRequired: "tijdelijk wachtwoord",
  // Resetting an attempt.
  status: "status",
  attemptNumber: "pogingnummer",
  // Deleting a question, an afname, a klas or a toets.
  answersCount: "antwoorden",
  attemptsAffected: "pogingen",
  assignmentsAffected: "afnames",
  assignmentsCount: "afnames",
  studentsCount: "leerlingen",
  deletedAttempts: "pogingen verwijderd",
  // Importing students.
  rowsCount: "regels",
  createdCount: "aangemaakt",
  existingCount: "bestonden al",
  renamedCount: "naam gewijzigd",
  addedToClassCount: "aan de klas toegevoegd",
  errorsCount: "niet gelukt",
  // Facilities: rows written before values were left out of the log.
  extraTimePercent: "extra tijd (%)",
  allowPaste: "plakken toegestaan",
  ignoreFocusEvents: "vensterwissels niet registreren",
  // Facilities: which kind changed (never the values).
  extraTimeChanged: "verlengde tijd gewijzigd",
  allowPasteChanged: "plakken toegestaan gewijzigd",
  focusLogChanged: "vensterwissels registreren gewijzigd",
  facilityActive: "faciliteit actief",
  restrictionOverridden: "ondanks beperking (AVG art. 18)",
  // Retention run and year-end close.
  verification: "verificatiecodes",
  rateLimit: "afremtellers",
  loginThrottle: "inlogtellers",
  attemptEvents: "logboekregels toetsen",
  attemptsReset: "pogingen met gewist logboek",
  inactiveStudents: "leerlingaccounts",
  auditLog: "logboekregels docenten",
  retentionRuns: "opschoonrapporten",
  expiredHolds: "verlopen bewaarblokkades",
  skippedByHold: "overgeslagen (bewaarblokkade)",
  archiveClasses: "klassen archiveren",
  deleteEvents: "logboeken verwijderen",
  deleteAttempts: "pogingen verwijderen",
  deleteLeavers: "vertrekkende leerlingen verwijderen",
  // "classIdsCount" and friends (from the generic mutation entry).
  orderedIdsCount: "vragen",
  classIdsCount: "klassen",
  studentIdsCount: "leerlingen",
  userIdsCount: "leerlingen",
  answerIdsCount: "antwoorden",
  questionIdsCount: "vragen",
  attemptIdsCount: "pogingen",
  assignmentIdsCount: "afnames",
  testIdsCount: "toetsen",
};

/**
 * tRPC procedures in Dutch, for the "trpc.mutation" safety-net rows (teacher
 * changes without a dedicated audit action, see server/api/trpc.ts) and the
 * `path` in security rows (rate limits, refused access). `fn` names the
 * function ("afname sluiten"); `done` (mutations) is the row label in place
 * of "Wijziging" ("Afname gesloten"). Rows already in the log are translated
 * when shown. tests/security/audit-path-labels.test.ts fails for a new
 * procedure without an entry.
 */
export const PROCEDURE_LABELS: Readonly<
  Record<string, { fn: string; done?: string }>
> = {
  // Installation
  "setup.status": { fn: "installatiestatus opvragen" },
  "setup.createFirstAdmin": {
    fn: "eerste docentaccount aanmaken",
    done: "Eerste docentaccount aangemaakt",
  },
  "setup.loadDemoData": { fn: "demodata laden", done: "Demodata geladen" },
  // Klassen
  "class.list": { fn: "klassen bekijken" },
  "class.get": { fn: "klas bekijken" },
  "class.create": { fn: "klas aanmaken", done: "Klas aangemaakt" },
  "class.update": { fn: "klas wijzigen", done: "Klas gewijzigd" },
  "class.setArchived": {
    fn: "klas archiveren of terugzetten",
    done: "Klas gearchiveerd of teruggezet",
  },
  "class.delete": { fn: "klas verwijderen", done: "Klas verwijderd" },
  "class.addMembers": {
    fn: "leerlingen aan een klas toevoegen",
    done: "Leerlingen aan een klas toegevoegd",
  },
  "class.removeMember": {
    fn: "leerling uit een klas halen",
    done: "Leerling uit een klas gehaald",
  },
  // Leerlingen
  "student.list": { fn: "leerlingen bekijken" },
  "student.get": { fn: "leerling bekijken" },
  "student.checkExisting": { fn: "leerlingnummers controleren" },
  "student.create": { fn: "leerling aanmaken", done: "Leerling aangemaakt" },
  "student.import": {
    fn: "leerlingen importeren",
    done: "Leerlingen geïmporteerd",
  },
  "student.update": {
    fn: "leerlinggegevens wijzigen",
    done: "Leerlinggegevens gewijzigd",
  },
  "student.resetPin": { fn: "pincode vernieuwen", done: "Pincode vernieuwd" },
  "student.resetPins": {
    fn: "pincodes vernieuwen",
    done: "Pincodes vernieuwd",
  },
  "student.getPins": { fn: "pincodes bekijken" },
  "student.setActive": {
    fn: "leerling deactiveren of weer actief maken",
    done: "Leerling gedeactiveerd of weer actief gemaakt",
  },
  "student.delete": { fn: "leerling verwijderen", done: "Leerling verwijderd" },
  "student.unlockLogin": {
    fn: "inlogblokkade opheffen",
    done: "Inlogblokkade opgeheven",
  },
  // Docenten
  "staff.list": { fn: "docenten bekijken" },
  "staff.me": { fn: "eigen account bekijken" },
  "staff.create": {
    fn: "docentaccount aanmaken",
    done: "Docentaccount aangemaakt",
  },
  "staff.resetPassword": {
    fn: "tijdelijk wachtwoord instellen",
    done: "Tijdelijk wachtwoord ingesteld",
  },
  "staff.changeMyPassword": {
    fn: "eigen wachtwoord wijzigen",
    done: "Eigen wachtwoord gewijzigd",
  },
  "staff.signOutOtherSessions": {
    fn: "andere sessies beëindigen",
    done: "Andere sessies beëindigd",
  },
  "staff.remove": {
    fn: "docentaccount verwijderen",
    done: "Docentaccount verwijderd",
  },
  "staff.updateMe": {
    fn: "eigen gegevens wijzigen",
    done: "Eigen gegevens gewijzigd",
  },
  // Toetsen en vragen
  "test.list": { fn: "toetsen bekijken" },
  "test.get": { fn: "toets bekijken" },
  "test.create": { fn: "toets aanmaken", done: "Toets aangemaakt" },
  "test.update": { fn: "toets wijzigen", done: "Toets gewijzigd" },
  "test.setStatus": {
    fn: "status van een toets wijzigen",
    done: "Status van een toets gewijzigd",
  },
  "test.duplicate": { fn: "toets kopiëren", done: "Toets gekopieerd" },
  "test.delete": { fn: "toets verwijderen", done: "Toets verwijderd" },
  "test.exportJson": { fn: "toets exporteren" },
  "test.importJson": { fn: "toets importeren", done: "Toets geïmporteerd" },
  "question.create": { fn: "vraag toevoegen", done: "Vraag toegevoegd" },
  "question.update": { fn: "vraag wijzigen", done: "Vraag gewijzigd" },
  "question.delete": { fn: "vraag verwijderen", done: "Vraag verwijderd" },
  "question.reorder": {
    fn: "volgorde van de vragen wijzigen",
    done: "Volgorde van de vragen gewijzigd",
  },
  "question.duplicate": { fn: "vraag kopiëren", done: "Vraag gekopieerd" },
  "question.copyToTest": {
    fn: "vraag naar een andere toets kopiëren",
    done: "Vraag naar een andere toets gekopieerd",
  },
  "question.checkSolution": {
    fn: "modeloplossing controleren",
    done: "Modeloplossing gecontroleerd",
  },
  "question.recordSolutionCheck": {
    fn: "controle van de modeloplossing opslaan",
    done: "Controle van de modeloplossing opgeslagen",
  },
  "code.run": { fn: "code uitvoeren", done: "Code uitgevoerd" },
  "code.grade": {
    fn: "code van een vraag uitvoeren",
    done: "Code van een vraag uitgevoerd",
  },
  "code.generateExpected": {
    fn: "verwachte uitvoer laten maken",
    done: "Verwachte uitvoer gemaakt",
  },
  // Afnames
  "assignment.list": { fn: "afnames bekijken" },
  "assignment.get": { fn: "afname bekijken" },
  "assignment.classStudents": { fn: "leerlingen van een klas bekijken" },
  "assignment.formOptions": { fn: "keuzes voor een afname ophalen" },
  "assignment.create": { fn: "afname plannen", done: "Afname gepland" },
  "assignment.duplicate": { fn: "afname kopiëren", done: "Afname gekopieerd" },
  "assignment.setStudents": {
    fn: "leerlingen van een afname kiezen",
    done: "Leerlingen van een afname gewijzigd",
  },
  "assignment.update": { fn: "afname wijzigen", done: "Afname gewijzigd" },
  "assignment.open": { fn: "afname openen", done: "Afname geopend" },
  "assignment.close": { fn: "afname sluiten", done: "Afname gesloten" },
  "assignment.reopen": { fn: "afname heropenen", done: "Afname heropend" },
  "assignment.delete": { fn: "afname verwijderen", done: "Afname verwijderd" },
  "assignment.regenerateAccessCode": {
    fn: "nieuwe toegangscode maken",
    done: "Nieuwe toegangscode gemaakt",
  },
  "assignment.setResultsReleased": {
    fn: "resultaten vrijgeven of weer verbergen",
    done: "Resultaten vrijgegeven of weer verborgen",
  },
  "assignment.monitor": { fn: "afname volgen" },
  "assignment.extendTime": {
    fn: "extra tijd geven",
    done: "Extra tijd gegeven",
  },
  "assignment.reopenAttempt": {
    fn: "poging heropenen",
    done: "Poging heropend",
  },
  "assignment.resetAttempt": { fn: "poging resetten", done: "Poging gewist" },
  // Resultaten en nakijken
  "review.results": { fn: "resultaten bekijken" },
  "review.attempt": { fn: "poging bekijken" },
  "review.setManualScore": { fn: "score aanpassen", done: "Score aangepast" },
  "review.regradeAttempt": {
    fn: "poging opnieuw nakijken",
    done: "Poging opnieuw nagekeken",
  },
  "review.regradeAssignment": {
    fn: "afname opnieuw nakijken",
    done: "Afname opnieuw nagekeken",
  },
  "review.gradingQueue": { fn: "antwoorden om na te kijken bekijken" },
  "review.exportCsv": {
    fn: "resultaten exporteren",
    done: "Resultaten geëxporteerd",
  },
  "dashboard.overview": { fn: "overzicht bekijken" },
  "analysis.assignment": { fn: "toetsanalyse bekijken" },
  "analysis.neutralizeQuestion": {
    fn: "vraag laten vervallen of terugzetten",
    done: "Vraag laten vervallen of teruggezet",
  },
  "similarity.assignment": { fn: "code vergelijken" },
  "similarity.pair": { fn: "twee antwoorden vergelijken" },
  "feedback.list": { fn: "snelle opmerkingen bekijken" },
  "feedback.create": {
    fn: "snelle opmerking toevoegen",
    done: "Snelle opmerking toegevoegd",
  },
  "feedback.update": {
    fn: "snelle opmerking wijzigen",
    done: "Snelle opmerking gewijzigd",
  },
  "feedback.delete": {
    fn: "snelle opmerking verwijderen",
    done: "Snelle opmerking verwijderd",
  },
  "feedback.used": {
    fn: "snelle opmerking gebruiken",
    done: "Snelle opmerking gebruikt",
  },
  "feedback.gradeMany": {
    fn: "meerdere antwoorden tegelijk beoordelen",
    done: "Meerdere antwoorden tegelijk beoordeeld",
  },
  "feedback.groups": { fn: "vergelijkbare antwoorden bekijken" },
  "feedback.answerContext": { fn: "antwoord bekijken" },
  "bank.search": { fn: "vragenbank doorzoeken" },
  "bank.get": { fn: "vraag uit de vragenbank bekijken" },
  "bank.tags": { fn: "labels van de vragenbank bekijken" },
  "bank.copyToTest": {
    fn: "vraag uit de vragenbank naar een toets kopiëren",
    done: "Vraag uit de vragenbank naar een toets gekopieerd",
  },
  "bank.examples": { fn: "voorbeeldtoetsen bekijken" },
  "bank.importExample": {
    fn: "voorbeeldtoets toevoegen",
    done: "Voorbeeldtoets toegevoegd",
  },
  // Faciliteiten
  "accommodation.get": { fn: "faciliteiten bekijken" },
  "accommodation.set": {
    fn: "faciliteiten aanpassen",
    done: "Faciliteiten aangepast",
  },
  "accommodation.setMany": {
    fn: "faciliteiten van meerdere leerlingen aanpassen",
    done: "Faciliteiten van meerdere leerlingen aangepast",
  },
  "accommodation.listForClass": { fn: "faciliteiten van een klas bekijken" },
  // Privacy
  "privacy.publicInfo": { fn: "privacyinformatie bekijken" },
  "privacy.getSettings": { fn: "privacy-instellingen bekijken" },
  "privacy.updateSettings": {
    fn: "privacy-instellingen wijzigen",
    done: "Privacy-instellingen gewijzigd",
  },
  "privacy.overview": { fn: "privacyoverzicht bekijken" },
  "privacy.retentionPreview": { fn: "opschoning vooraf bekijken" },
  "privacy.runRetention": {
    fn: "opschoning uitvoeren",
    done: "Opschoning uitgevoerd",
  },
  "privacy.exportStudent": {
    fn: "gegevens van een leerling exporteren",
    done: "Gegevens van een leerling geëxporteerd",
  },
  "privacy.erasePreview": { fn: "wissen van een leerling vooraf bekijken" },
  "privacy.eraseStudent": { fn: "leerling wissen", done: "Leerling gewist" },
  "privacy.setRestriction": {
    fn: "verwerking beperken of beperking opheffen",
    done: "Verwerking beperkt of beperking opgeheven",
  },
  "privacy.deleteAttemptEvents": {
    fn: "logboek van een poging wissen",
    done: "Logboek van een poging gewist",
  },
  "privacy.listHolds": { fn: "bewaarblokkades bekijken" },
  "privacy.createHold": {
    fn: "bewaarblokkade instellen",
    done: "Bewaarblokkade ingesteld",
  },
  "privacy.removeHold": {
    fn: "bewaarblokkade opheffen",
    done: "Bewaarblokkade opgeheven",
  },
  "privacy.holdAssignments": { fn: "afnames voor een bewaarblokkade bekijken" },
  "privacy.auditLog": { fn: "logboek bekijken" },
  "privacy.exportAuditLog": {
    fn: "logboek exporteren",
    done: "Logboek geëxporteerd",
  },
  "privacy.schoolYears": { fn: "schooljaren bekijken" },
  "privacy.schoolYearPreview": {
    fn: "afsluiten van een schooljaar vooraf bekijken",
  },
  "privacy.closeSchoolYear": {
    fn: "schooljaar afsluiten",
    done: "Schooljaar afgesloten",
  },
  "privacy.revokeAllSessions": {
    fn: "alle sessies beëindigen",
    done: "Alle sessies beëindigd",
  },
  "privacy.processingRegister": { fn: "verwerkingsregister bekijken" },
  "privacy.myData": { fn: "eigen gegevens bekijken (leerling)" },
  "privacy.exportMyData": {
    fn: "eigen gegevens downloaden (leerling)",
    done: "Eigen gegevens gedownload",
  },
  // Leerlingportaal
  "portal.dashboard": { fn: "overzicht bekijken (leerling)" },
  "portal.getAssignment": { fn: "toets bekijken (leerling)" },
  "portal.startAttempt": { fn: "toets starten", done: "Toets gestart" },
  "portal.getAttempt": { fn: "toets openen (leerling)" },
  "portal.saveAnswer": { fn: "antwoord opslaan", done: "Antwoord opgeslagen" },
  "portal.logEvents": {
    fn: "logboek van een toets bijwerken",
    done: "Logboek van een toets bijgewerkt",
  },
  "portal.heartbeat": { fn: "verbinding tijdens een toets controleren" },
  "portal.submitAttempt": { fn: "toets inleveren", done: "Toets ingeleverd" },
  "portal.getResult": { fn: "resultaat bekijken (leerling)" },
  "portal.myResults": { fn: "eigen resultaten bekijken (leerling)" },
  "help.hints": { fn: "hints bekijken" },
  "help.revealHint": { fn: "hint bekijken", done: "Hint bekeken" },
  "help.solutions": { fn: "uitwerkingen bekijken" },
  "preferences.get": { fn: "weergave-instellingen ophalen" },
  "preferences.update": {
    fn: "weergave-instellingen opslaan",
    done: "Weergave-instellingen opgeslagen",
  },
};

/** "afname sluiten" for "assignment.close"; unknown paths stay as they are. */
export function procedureLabel(path: string): string {
  return Object.hasOwn(PROCEDURE_LABELS, path)
    ? PROCEDURE_LABELS[path].fn
    : path;
}

/** The Dutch row label of a generic "trpc.mutation" entry, if known. */
function mutationRowLabel(
  action: string,
  details: Record<string, unknown> | null | undefined,
): string | null {
  if (action !== "trpc.mutation") return null;
  const path = details?.path;
  if (typeof path !== "string" || !Object.hasOwn(PROCEDURE_LABELS, path))
    return null;
  return PROCEDURE_LABELS[path].done ?? null;
}

/** Dutch words for enum-like values, per key. */
const VALUE_LABELS: Record<string, Record<string, string>> = {
  // student.updated: which fields of the account changed.
  fields: {
    name: "naam",
    studentNumber: "leerlingnummer",
  },
  via: {
    retention: "automatische opschoning",
    school_year: "schooljaar afsluiten",
    similarity: "code vergelijken",
    import: "leerlingen importeren",
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
  scope: {
    assignment: "deze afname",
    test: "alle afnames van de toets",
  },
  mode: {
    exam: "toets",
    practice: "oefenen",
    full_points: "volle punten",
    drop: "vraag telt niet mee",
  },
  status: {
    in_progress: "bezig",
    submitted: "ingeleverd",
    draft: "concept",
    published: "gepubliceerd",
    archived: "gearchiveerd",
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

/** A full ISO timestamp (not a bare date such as a period's "2026-10-01"). */
const ISO_DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

function formatValue(key: string, value: unknown): string | null {
  if (value === null || value === undefined) return null;
  // "deadlineAt" and friends: Dutch date and time instead of ISO.
  if (
    typeof value === "string" &&
    key.endsWith("At") &&
    ISO_DATE_TIME.test(value)
  ) {
    return formatDateTimeNl(value) || value;
  }
  if (key === "path" && typeof value === "string") return procedureLabel(value);
  if (typeof value === "boolean") return value ? "ja" : "nee";
  if (typeof value === "number") return value.toLocaleString("nl-NL");
  if (Array.isArray(value)) {
    return value
      .map((v) =>
        key === "changedKeys"
          ? (SETTING_LABELS[String(v)] ?? String(v))
          : (VALUE_LABELS[key]?.[String(v)] ?? String(v)),
      )
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
 * subject column). Zero counts are left out for readability. Pass the
 * row's `action`: for a generic "trpc.mutation" whose procedure has a row
 * label (`auditRowLabel`), the procedure is not repeated here.
 */
export function formatAuditDetails(
  details: Record<string, unknown> | null | undefined,
  maxParts = 8,
  action?: string,
): string {
  if (!details) return "";
  const pathInLabel = action
    ? mutationRowLabel(action, details) != null
    : false;
  const parts: string[] = [];
  for (const [key, value] of Object.entries(details)) {
    if (HIDDEN.test(key) || value === 0) continue;
    if (key === "path" && pathInLabel) continue;
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

/**
 * The label of one log row: the action's label, or for a generic
 * "trpc.mutation" what the teacher did ("Afname gesloten" instead of
 * "Wijziging"). Also for rows written before this existed.
 */
export function auditRowLabel(
  action: string,
  details?: Record<string, unknown> | null,
): string {
  return mutationRowLabel(action, details) ?? auditActionLabel(action);
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
