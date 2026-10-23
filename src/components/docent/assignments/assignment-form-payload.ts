/**
 * Pure logic of the "Afname plannen" form: presets, validation, the create
 * payload and the summary texts. No React, no server imports (tested with
 * `bun test src/components/docent/assignments`).
 */
import type { AssignmentSettings } from "@/lib/questions/schema";
import {
  ACCESS_CODE_REGEX,
  type AssignmentMode,
  defaultSettingsForMode,
  normalizeAccessCode,
} from "./defaults";
import { fromDateTimeLocal } from "./format";

export type StartMode = "now" | "scheduled" | "manual";
export type CodeMode = "generate" | "none" | "custom";
/** The mode cards: two modes plus the "Zelfstudie (altijd open)" preset. */
export type Preset = AssignmentMode | "selfstudy";

export const MAX_CLASSES = 20;
export const MAX_STUDENTS = 500;

export type AssignmentFormState = {
  testId: string;
  classIds: string[];
  /** Only for these students (one class only); null = the whole class. */
  studentIds: string[] | null;
  retakeOfId: string | null;
  title: string;
  preset: Preset;
  settings: AssignmentSettings;
  startMode: StartMode;
  /** datetime-local value */
  opensAt: string;
  closesEnabled: boolean;
  /** datetime-local value */
  closesAt: string;
  /** Minutes as typed; empty = no limit. */
  timeLimit: string;
  codeMode: CodeMode;
  customCode: string;
  /** Several classes: each class its own generated code. */
  accessCodePerClass: boolean;
};

export type CreatePayload = {
  testId: string;
  classIds: string[];
  studentIds?: string[];
  retakeOfId?: string | null;
  accessCodePerClass: boolean;
  title: string | null;
  mode: AssignmentMode;
  openNow: boolean;
  opensAt: Date | null;
  closesAt: Date | null;
  timeLimitMinutes: number | null;
  accessCode?: string | null;
  generateAccessCode: boolean;
  settings: AssignmentSettings;
};

/** The mode an assignment gets for a preset. */
export function presetMode(preset: Preset): AssignmentMode {
  return preset === "selfstudy" ? "practice" : preset;
}

/**
 * Settings and form choices per preset. Zelfstudie: practice, open now,
 * no end time, 100 attempts, results right away, no access code, hints
 * on and the model solution after the attempts.
 */
export function presetDefaults(
  preset: Preset,
): Pick<AssignmentFormState, "settings" | "codeMode"> &
  Partial<Pick<AssignmentFormState, "startMode" | "closesEnabled">> {
  if (preset === "selfstudy") {
    return {
      settings: {
        ...defaultSettingsForMode("practice"),
        maxAttempts: 100,
        showResults: "immediately",
        allowHints: true,
        showSolutions: "after_attempts",
      },
      codeMode: "none",
      startMode: "now",
      closesEnabled: false,
    };
  }
  return {
    settings: defaultSettingsForMode(preset),
    codeMode: preset === "exam" ? "generate" : "none",
  };
}

/** "a,b,,b" → ["a", "b"] (trimmed, unique, at most 500). */
export function parseIdList(value: string | null | undefined): string[] {
  if (!value) return [];
  const ids = value
    .split(",")
    .map((s) => s.trim())
    .filter((s) => s.length > 0 && s.length <= 64);
  return [...new Set(ids)].slice(0, MAX_STUDENTS);
}

/** "Herkansing – Toets H3" / "Inhaaltoets – Toets H3". */
export function defaultRetakeTitle(
  kind: "herkansing" | "inhaaltoets",
  testTitle: string,
): string {
  return `${kind === "herkansing" ? "Herkansing" : "Inhaaltoets"} – ${testTitle}`;
}

/** What the form needs from `assignment.formOptions`. */
export type FormOptionsLike = {
  /** Published tests only. */
  tests: readonly { id: string; title: string }[];
  /** Classes that are not archived. */
  classes: readonly { id: string }[];
};

export type InitialFormState = {
  state: AssignmentFormState;
  /**
   * The link asked for this toets (?toets) but it can't be planned: it is
   * archived, a draft or gone. The id, so the form can link to it.
   */
  unavailableTestId: string | null;
  /** Same for ?klas: the class is archived or gone. */
  unavailableClassId: string | null;
};

/**
 * Initial form state from the query string (?toets, ?klas, ?leerlingen,
 * ?herkansing). When there is only one toets or class, it is preselected,
 * but only when the link doesn't ask for another one: a herkansing of an
 * afname whose toets was archived must never silently get a different
 * toets (or class).
 */
export function initialFormState(
  options: FormOptionsLike,
  params: URLSearchParams,
): InitialFormState {
  const preTest = params.get("toets") || null;
  const preClass = params.get("klas") || null;
  const retakeOfId = params.get("herkansing");
  const studentIds = parseIdList(params.get("leerlingen"));
  const testId = preTest
    ? options.tests.some((t) => t.id === preTest)
      ? preTest
      : ""
    : options.tests.length === 1
      ? options.tests[0].id
      : "";
  const classIds = preClass
    ? options.classes.some((c) => c.id === preClass)
      ? [preClass]
      : []
    : options.classes.length === 1
      ? [options.classes[0].id]
      : [];
  const testTitle = options.tests.find((t) => t.id === testId)?.title;
  const targeted =
    (studentIds.length > 0 || !!retakeOfId) && classIds.length === 1;
  const title =
    testTitle && retakeOfId
      ? defaultRetakeTitle("herkansing", testTitle)
      : testTitle && studentIds.length
        ? defaultRetakeTitle("inhaaltoets", testTitle)
        : "";
  const preset: Preset = "exam";
  const defaults = presetDefaults(preset);
  return {
    state: {
      testId,
      classIds,
      studentIds: targeted ? studentIds : null,
      retakeOfId: retakeOfId || null,
      title,
      preset,
      settings: defaults.settings,
      startMode: "now",
      opensAt: "",
      closesEnabled: false,
      closesAt: "",
      timeLimit: "",
      codeMode: defaults.codeMode,
      customCode: "",
      accessCodePerClass: false,
    },
    unavailableTestId: preTest && !testId ? preTest : null,
    unavailableClassId: preClass && classIds.length === 0 ? preClass : null,
  };
}

export function parseTimeLimit(value: string): number | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  const n = Number.parseInt(trimmed, 10);
  return Number.isFinite(n) ? n : Number.NaN;
}

/** Student selection only counts with exactly one class. */
export function effectiveStudentIds(
  state: Pick<AssignmentFormState, "classIds" | "studentIds">,
): string[] | null {
  return state.classIds.length === 1 && state.studentIds
    ? state.studentIds
    : null;
}

/** Field errors (Dutch); empty object = valid. */
export function validateAssignmentForm(
  state: AssignmentFormState,
  now = new Date(),
): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!state.testId) errors.test = "Kies een toets.";
  if (state.classIds.length === 0) errors.class = "Kies minstens één klas.";
  else if (state.classIds.length > MAX_CLASSES)
    errors.class = `Kies hoogstens ${MAX_CLASSES} klassen.`;
  const students = effectiveStudentIds(state);
  if (students && students.length === 0)
    errors.students = "Kies minstens één leerling.";
  const open =
    state.startMode === "scheduled" ? fromDateTimeLocal(state.opensAt) : null;
  if (state.startMode === "scheduled") {
    if (!open) errors.opensAt = "Kies een starttijd.";
    else if (open <= now)
      errors.opensAt =
        "De starttijd ligt in het verleden. Kies ‘Nu openen’ of een later moment.";
  }
  if (state.closesEnabled) {
    const close = fromDateTimeLocal(state.closesAt);
    if (!close)
      errors.closesAt = "Kies een eindtijd of zet automatisch sluiten uit.";
    else if (close <= now)
      errors.closesAt = "De eindtijd ligt in het verleden.";
    else if (open && close <= open)
      errors.closesAt = "Het einde moet na de start liggen.";
  }
  const limit = parseTimeLimit(state.timeLimit);
  if (limit !== null && (!Number.isFinite(limit) || limit < 1 || limit > 1440))
    errors.timeLimit = "Vul een aantal minuten in tussen 1 en 1440.";
  if (
    state.codeMode === "custom" &&
    !ACCESS_CODE_REGEX.test(normalizeAccessCode(state.customCode))
  )
    errors.code = "Gebruik 3 tot 20 letters, cijfers of streepjes.";
  return errors;
}

/** The input for `assignment.create` (call after validating). */
export function buildCreatePayload(state: AssignmentFormState): CreatePayload {
  const students = effectiveStudentIds(state);
  const limit = parseTimeLimit(state.timeLimit);
  return {
    testId: state.testId,
    classIds: [...new Set(state.classIds)],
    ...(students?.length ? { studentIds: students } : {}),
    ...(state.retakeOfId ? { retakeOfId: state.retakeOfId } : {}),
    accessCodePerClass:
      state.classIds.length > 1 &&
      state.codeMode === "generate" &&
      state.accessCodePerClass,
    title: state.title.trim() || null,
    mode: presetMode(state.preset),
    openNow: state.startMode === "now",
    opensAt:
      state.startMode === "scheduled" ? fromDateTimeLocal(state.opensAt) : null,
    closesAt: state.closesEnabled ? fromDateTimeLocal(state.closesAt) : null,
    timeLimitMinutes: limit !== null && Number.isFinite(limit) ? limit : null,
    accessCode:
      state.codeMode === "custom"
        ? normalizeAccessCode(state.customCode)
        : state.codeMode === "none"
          ? null
          : undefined,
    generateAccessCode: state.codeMode === "generate",
    settings: state.settings,
  };
}

/** "4H1, 4H2 · 57 leerlingen". */
export function classesSummary(
  classes: readonly { name: string; studentCount: number }[],
): string {
  const total = classes.reduce((s, c) => s + c.studentCount, 0);
  return `${classes.map((c) => c.name).join(", ")} · ${total} ${total === 1 ? "leerling" : "leerlingen"}`;
}

/** "3 van 28". */
export function studentsSummary(selected: number, total: number): string {
  return `${selected} van ${total}`;
}

/** Success toast after creating. */
export function createdToast(
  count: number,
  effectiveStatus: "planned" | "open" | "closed",
): string {
  if (count > 1) return `${count} afnames gepland`;
  return effectiveStatus === "open"
    ? "De afname is open"
    : "De afname is gepland";
}
