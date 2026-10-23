/** Dutch sentences with counts, so "1 antwoorden" or "1 … hebben" can't happen. */

const n = (count: number) => count.toLocaleString("nl-NL");

/**
 * How many of the students who handed in have a pass mark, e.g. "2 van de 5
 * leerlingen hebben een voldoende." The verb agrees with the count, and the
 * small cases read naturally ("Beide leerlingen …", "Geen van de …").
 */
export function passedSentence(passed: number, submitted: number): string {
  if (submitted <= 0) return "Nog geen cijfers.";
  if (submitted === 1) {
    return passed > 0
      ? "1 leerling leverde in en heeft een voldoende."
      : "1 leerling leverde in en heeft geen voldoende.";
  }
  if (submitted === 2 && passed === 2)
    return "Beide leerlingen hebben een voldoende.";
  if (submitted === 2 && passed === 0)
    return "Geen van beide leerlingen heeft een voldoende.";
  if (passed <= 0)
    return `Geen van de ${n(submitted)} leerlingen heeft een voldoende.`;
  if (passed >= submitted)
    return `Alle ${n(submitted)} leerlingen hebben een voldoende.`;
  return `${n(passed)} van de ${n(submitted)} leerlingen ${passed === 1 ? "heeft" : "hebben"} een voldoende.`;
}

/** "Ook toepassen op 1 gelijk antwoord …" / "… op 3 gelijke antwoorden …". */
export function applyToSameLabel(count: number): string {
  return count === 1
    ? "Ook toepassen op 1 gelijk antwoord zonder handmatige score"
    : `Ook toepassen op ${n(count)} gelijke antwoorden zonder handmatige score`;
}

/**
 * Above an answer when grouping: how many other students gave exactly the
 * same answer, and how many of them already have a manual score (a bulk save
 * leaves those alone).
 */
export function identicalAnswersNote(ungraded: number, graded: number): string {
  const total = ungraded + graded;
  const head =
    total === 1
      ? "Nog 1 leerling gaf precies hetzelfde antwoord."
      : `Nog ${n(total)} leerlingen gaven precies hetzelfde antwoord.`;
  if (graded === 0) return head;
  if (total === 1)
    return `${head} Dat antwoord heeft al een handmatige score en verandert niet mee.`;
  return graded === 1
    ? `${head} 1 daarvan heeft al een handmatige score en verandert niet mee.`
    : `${head} ${n(graded)} daarvan hebben al een handmatige score en veranderen niet mee.`;
}

/**
 * "Alle 3 ingeleverde pogingen worden …" / "De ingeleverde poging wordt …".
 * `null` when the exact number is not known on the page (a practice afname
 * where students handed in more than once: every attempt is regraded, not
 * only the one shown per student).
 */
export function regradeDescription(submitted: number | null): string {
  const lead =
    submitted == null
      ? "Alle ingeleverde pogingen, ook eerdere pogingen van dezelfde leerling, worden opnieuw automatisch nagekeken"
      : submitted === 1
        ? "De ingeleverde poging wordt opnieuw automatisch nagekeken"
        : `Alle ${n(submitted)} ingeleverde pogingen worden opnieuw automatisch nagekeken`;
  return `${lead} met de huidige testgevallen. Handmatige scores en feedback blijven staan. Dit kan even duren.`;
}

/** After "Opnieuw nakijken": how many attempts are being regraded. */
export function regradeToast(scheduled: number): string {
  if (scheduled <= 0) return "Er is geen poging om opnieuw na te kijken";
  return scheduled === 1
    ? "1 poging wordt opnieuw nagekeken"
    : `${n(scheduled)} pogingen worden opnieuw nagekeken`;
}

/** "1 woord" / "12 woorden": the length of a written answer. */
export function wordCountLabel(text: string): string {
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return words === 1 ? "1 woord" : `${n(words)} woorden`;
}

/** "1 seconde" / "5 seconden" (rounded to whole seconds). */
export function secondsLabel(ms: number): string {
  const seconds = Math.round(ms / 1000);
  return seconds === 1 ? "1 seconde" : `${n(seconds)} seconden`;
}

/* ------------------------- Restricted processing ------------------------- */
// AVG art. 18: bulk actions leave students whose processing is restricted
// alone, and say so, instead of a count that silently doesn't add up.

const RESTRICTED = "de verwerking is beperkt (AVG art. 18)";

/** feedback.gradeMany: answers left alone. Empty when none. */
export function restrictedAnswersSkipNote(skipped: number): string {
  if (skipped <= 0) return "";
  return skipped === 1
    ? `1 antwoord overgeslagen: ${RESTRICTED}. Dat antwoord houdt zijn huidige score.`
    : `${n(skipped)} antwoorden overgeslagen: ${RESTRICTED}. Die antwoorden houden hun huidige score.`;
}

/** review.regradeAssignment: attempts not regraded. Empty when none. */
export function restrictedAttemptsSkipNote(skipped: number): string {
  if (skipped <= 0) return "";
  return skipped === 1
    ? `1 poging overgeslagen: ${RESTRICTED}. Die score blijft zoals hij was.`
    : `${n(skipped)} pogingen overgeslagen: ${RESTRICTED}. Die scores blijven zoals ze waren.`;
}

/** review.exportCsv: rows without results. Empty when none. */
export function restrictedExportNote(count: number): string {
  if (count <= 0) return "";
  return count === 1
    ? `Bij 1 leerling staan geen resultaten: ${RESTRICTED}.`
    : `Bij ${n(count)} leerlingen staan geen resultaten: ${RESTRICTED}.`;
}

export interface ToastCopy {
  tone: "success" | "warning" | "info";
  title: string;
  description?: string;
}

/** After saving one score for several answers (feedback.gradeMany). */
export function gradeManyToast(res: {
  updated: number;
  recomputed: boolean;
  skippedRestricted: number;
  /** Identical answers that another review already scored (left alone). */
  skippedGraded?: number;
}): ToastCopy {
  const graded = res.skippedGraded ?? 0;
  const gradedNote =
    graded > 0
      ? graded === 1
        ? "1 antwoord met een eerdere beoordeling is overgeslagen."
        : `${n(graded)} antwoorden met een eerdere beoordeling zijn overgeslagen.`
      : "";
  const skipped =
    [restrictedAnswersSkipNote(res.skippedRestricted), gradedNote]
      .filter(Boolean)
      .join(" ") || undefined;
  if (res.updated <= 0)
    return {
      tone: "warning",
      title: "Er is niets opgeslagen",
      description: skipped,
    };
  if (!res.recomputed)
    return {
      tone: "warning",
      title: "Score opgeslagen, maar een totaal kon niet worden bijgewerkt",
      description: skipped,
    };
  const title =
    res.updated === 1
      ? "Beoordeling opgeslagen"
      : `Beoordeling opgeslagen voor ${n(res.updated)} antwoorden`;
  return skipped
    ? { tone: "warning", title, description: skipped }
    : { tone: "success", title };
}

/** After "Alles opnieuw nakijken" (review.regradeAssignment). */
export function regradeAssignmentToast(res: {
  scheduled: number;
  skippedRestricted: number;
}): ToastCopy {
  const skipped = restrictedAttemptsSkipNote(res.skippedRestricted);
  if (res.scheduled <= 0)
    return {
      tone: skipped ? "warning" : "info",
      title: regradeToast(0),
      description: skipped || undefined,
    };
  const refresh = "Scores en cijfers worden vanzelf bijgewerkt.";
  return skipped
    ? {
        tone: "warning",
        title: regradeToast(res.scheduled),
        description: `${refresh} ${skipped}`,
      }
    : {
        tone: "success",
        title: regradeToast(res.scheduled),
        description: refresh,
      };
}

/** After downloading the results (review.exportCsv). */
export function exportToast(res: {
  filename: string;
  restrictedCount: number;
}): ToastCopy {
  const restricted = restrictedExportNote(res.restrictedCount);
  return restricted
    ? {
        tone: "warning",
        title: "Export gedownload",
        description: `${res.filename}. ${restricted}`,
      }
    : {
        tone: "success",
        title: "Export gedownload",
        description: res.filename,
      };
}
