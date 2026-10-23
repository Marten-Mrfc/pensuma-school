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

/** "Alle 3 ingeleverde pogingen worden …" / "De ingeleverde poging wordt …". */
export function regradeDescription(submitted: number): string {
  const lead =
    submitted === 1
      ? "De ingeleverde poging wordt opnieuw automatisch nagekeken"
      : `Alle ${n(submitted)} ingeleverde pogingen worden opnieuw automatisch nagekeken`;
  return `${lead} met de huidige testgevallen. Handmatige scores en feedback blijven staan. Dit kan even duren.`;
}
