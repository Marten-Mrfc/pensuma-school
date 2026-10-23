/**
 * Result counts of the teacher's searches and filters: shown on screen and
 * read aloud after a change (useResultAnnouncement, WCAG 4.1.3). Pure, so
 * the screen text and the announcement always say the same.
 */

const count = (n: number, one: string, many: string) =>
  `${n.toLocaleString("nl-NL")} ${n === 1 ? one : many}`;

/** /docent/leerlingen header: "3 leerlingen gevonden." */
export function studentsFoundMessage(total: number, filtered: boolean): string {
  if (!filtered) return `${count(total, "leerling", "leerlingen")} in Pensuma.`;
  return total === 0
    ? "Geen leerlingen gevonden."
    : `${count(total, "leerling", "leerlingen")} gevonden.`;
}

/** /docent/toetsen after searching or filtering. */
export function testsFoundMessage(total: number): string {
  return total === 0
    ? "Geen toetsen gevonden."
    : `${count(total, "toets", "toetsen")} gevonden.`;
}

/** Live overview (monitor) after searching or filtering. */
export function selectionMessage(total: number): string {
  return total === 0
    ? "Geen leerlingen in deze selectie."
    : `${count(total, "leerling", "leerlingen")} in deze selectie.`;
}

export type ImportPreviewCounts = {
  new: number;
  existing: number;
  member: number;
  error: number;
};

/** Chip text for students who already have an account. */
export function existingLabel(n: number): string {
  return `${n.toLocaleString("nl-NL")} ${n === 1 ? "bestaat" : "bestaan"} al`;
}

/** Import preview: "2 nieuw, 1 bestaat al, 1 met fout." */
export function importPreviewSummary(c: ImportPreviewCounts): string {
  const parts = [
    `${c.new.toLocaleString("nl-NL")} nieuw`,
    existingLabel(c.existing),
  ];
  if (c.member > 0)
    parts.push(`${c.member.toLocaleString("nl-NL")} al in klas`);
  if (c.error > 0) parts.push(`${c.error.toLocaleString("nl-NL")} met fout`);
  return `Voorbeeld: ${parts.join(", ")}.`;
}

/** Audit log after filtering or loading more rows. */
export function auditRowsMessage(rows: number, filtered: boolean): string {
  if (rows === 0) {
    return filtered
      ? "Geen handelingen gevonden."
      : "Nog geen handelingen vastgelegd.";
  }
  return `${count(rows, "regel", "regels")} getoond.`;
}
