/**
 * Every app URL in one place, so features built by different people link
 * to each other consistently. Paths are Dutch; identifiers are English.
 */
export const routes = {
  home: "/",
  login: "/inloggen",
  setup: "/setup",
  /** Public privacy statement (AVG). */
  privacy: "/privacy",
  /** Public accessibility statement. */
  accessibility: "/toegankelijkheid",

  docent: {
    dashboard: "/docent",
    classes: "/docent/klassen",
    class: (classId: string) => `/docent/klassen/${classId}`,
    /** Printable login cards (outside the shell). */
    classLoginCards: (classId: string) =>
      `/print/klassen/${classId}/inlogkaarten`,
    /** Printable login cards for specific students (any class). */
    studentLoginCards: (userIds: string[]) =>
      `/print/leerlingen/inlogkaarten?ids=${userIds.map(encodeURIComponent).join(",")}`,
    students: "/docent/leerlingen",
    student: (userId: string) => `/docent/leerlingen/${userId}`,
    staff: "/docent/docenten",
    account: "/docent/account",
    tests: "/docent/toetsen",
    test: (testId: string) => `/docent/toetsen/${testId}`,
    assignments: "/docent/afnames",
    newAssignment: (opts?: {
      testId?: string;
      classId?: string;
      /** Only these students (inhaaltoets/herkansing). */
      studentIds?: string[];
      /** The assignment this one is a herkansing of. */
      retakeOf?: string;
    }) => {
      const qs = new URLSearchParams();
      if (opts?.testId) qs.set("toets", opts.testId);
      if (opts?.classId) qs.set("klas", opts.classId);
      if (opts?.studentIds?.length) {
        qs.set("leerlingen", opts.studentIds.join(","));
      }
      if (opts?.retakeOf) qs.set("herkansing", opts.retakeOf);
      const s = qs.toString();
      return `/docent/afnames/nieuw${s ? `?${s}` : ""}`;
    },
    assignment: (assignmentId: string) => `/docent/afnames/${assignmentId}`,
    assignmentResults: (assignmentId: string) =>
      `/docent/afnames/${assignmentId}/resultaten`,
    assignmentGrading: (assignmentId: string) =>
      `/docent/afnames/${assignmentId}/nakijken`,
    attempt: (assignmentId: string, attemptId: string) =>
      `/docent/afnames/${assignmentId}/pogingen/${attemptId}`,
    assignmentAnalysis: (assignmentId: string) =>
      `/docent/afnames/${assignmentId}/analyse`,
    assignmentSimilarity: (assignmentId: string) =>
      `/docent/afnames/${assignmentId}/vergelijken`,
    privacy: "/docent/privacy",
    privacyLog: "/docent/privacy/logboek",
  },

  leerling: {
    dashboard: "/leerling",
    assignment: (assignmentId: string) => `/leerling/afname/${assignmentId}`,
    /** Distraction-free exam page. */
    attempt: (attemptId: string) => `/leerling/poging/${attemptId}`,
    results: "/leerling/resultaten",
    result: (attemptId: string) => `/leerling/resultaten/${attemptId}`,
    practice: "/leerling/oefenen",
    myData: "/leerling/mijn-gegevens",
  },
} as const;
