/**
 * Audit log catalogue: every action that can appear in `audit_log`, with
 * the Dutch label shown to teachers and a category for filtering.
 * Pure module (no server or browser imports).
 */

export type AuditSubjectType =
  | "student"
  | "class"
  | "attempt"
  | "answer"
  | "assignment"
  | "question"
  | "test"
  | "staff"
  | "settings"
  | "system";

export type AuditCategory =
  | "auth"
  | "access"
  | "change"
  | "security"
  | "privacy";

export const AUDIT_ACTIONS = {
  // auth
  "auth.sign_in": { label: "Ingelogd (docent)", category: "auth" },
  "auth.account_locked": {
    label: "Account tijdelijk geblokkeerd na mislukte inlogpogingen",
    category: "auth",
  },
  "auth.network_locked": {
    label: "Inloggen vanaf een netwerk tijdelijk geblokkeerd",
    category: "auth",
  },
  "auth.login_unlocked": { label: "Inlogblokkade opgeheven", category: "auth" },
  "auth.password_changed": { label: "Wachtwoord gewijzigd", category: "auth" },
  "auth.setup_completed": {
    label: "Eerste docentaccount aangemaakt",
    category: "auth",
  },
  "auth.admin_api": { label: "Beheerfunctie aangeroepen", category: "auth" },

  // security
  "security.access_denied": {
    label: "Toegang geweigerd",
    category: "security",
  },
  "security.rate_limited": {
    label: "Te veel verzoeken (afgeremd)",
    category: "security",
  },
  "security.access_code_failed": {
    label: "Herhaaldelijk verkeerde toegangscode",
    category: "security",
  },
  "security.login_spray_suspected": {
    label: "Verdacht veel mislukte inlogpogingen",
    category: "security",
  },

  // access
  "student.viewed": { label: "Leerlinggegevens bekeken", category: "access" },
  "student.pins_viewed": {
    label: "Pincodes bekeken (inlogkaarten)",
    category: "access",
  },
  "attempt.viewed": { label: "Poging bekeken", category: "access" },
  "similarity.viewed": {
    label: "Code vergeleken (overzicht afname)",
    category: "access",
  },

  // change
  "student.created": { label: "Leerling aangemaakt", category: "change" },
  "student.imported": { label: "Leerlingen geïmporteerd", category: "change" },
  "student.updated": {
    label: "Leerlinggegevens gewijzigd",
    category: "change",
  },
  "student.deactivated": {
    label: "Leerling gedeactiveerd",
    category: "change",
  },
  "student.reactivated": { label: "Leerling weer actief", category: "change" },
  "student.deleted": { label: "Leerling verwijderd", category: "change" },
  "student.pin_reset": { label: "Pincode vernieuwd", category: "change" },
  "student.accommodation_updated": {
    label: "Faciliteiten aangepast",
    category: "change",
  },
  "staff.created": { label: "Docentaccount aangemaakt", category: "change" },
  "staff.password_reset": {
    label: "Tijdelijk wachtwoord ingesteld",
    category: "change",
  },
  "staff.removed": { label: "Docentaccount verwijderd", category: "change" },
  "answer.score_changed": { label: "Score aangepast", category: "change" },
  "question.neutralized": {
    label: "Vraag laten vervallen",
    category: "change",
  },
  "attempt.reset": { label: "Poging gewist", category: "change" },
  "trpc.mutation": { label: "Wijziging", category: "change" },

  // privacy
  "student.exported": {
    label: "Gegevens geëxporteerd (inzageverzoek)",
    category: "privacy",
  },
  "student.restricted": { label: "Verwerking beperkt", category: "privacy" },
  "student.unrestricted": { label: "Beperking opgeheven", category: "privacy" },
  "attempt.events_deleted": {
    label: "Logboek van poging gewist",
    category: "privacy",
  },
  "results.exported": { label: "Resultaten geëxporteerd", category: "privacy" },
  "privacy.settings_updated": {
    label: "Privacy-instellingen gewijzigd",
    category: "privacy",
  },
  "privacy.retention_run": {
    label: "Automatische opschoning uitgevoerd",
    category: "privacy",
  },
  "privacy.hold_created": {
    label: "Bewaarblokkade ingesteld",
    category: "privacy",
  },
  "privacy.hold_removed": {
    label: "Bewaarblokkade opgeheven",
    category: "privacy",
  },
  "privacy.school_year_closed": {
    label: "Schooljaar afgesloten",
    category: "privacy",
  },
  "privacy.sessions_revoked": {
    label: "Alle sessies beëindigd",
    category: "privacy",
  },
  "privacy.audit_exported": {
    label: "Logboek geëxporteerd",
    category: "privacy",
  },
} as const satisfies Record<string, { label: string; category: AuditCategory }>;

export type AuditAction = keyof typeof AUDIT_ACTIONS;

export const AUDIT_CATEGORY_LABELS: Record<AuditCategory, string> = {
  auth: "Inloggen",
  access: "Inzien",
  change: "Wijzigen",
  security: "Beveiliging",
  privacy: "Privacy",
};
