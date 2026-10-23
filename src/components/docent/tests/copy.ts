/** Dutch sentences with counts for the test builder ("1 poging", not "1 pogingen"). */
import { plural } from "../students/format";

/** Above the builder of a test that students already made. */
export function testAttemptsNote(attemptCount: number): string {
  return `Deze toets is al gemaakt (${plural(attemptCount, "poging", "pogingen")}).`;
}

/** Why a test that was already made is archived instead of deleted. */
export function archiveInsteadDescription(attemptCount: number): string {
  const made =
    attemptCount === 1
      ? "al 1 keer gemaakt door een leerling"
      : `al ${attemptCount.toLocaleString("nl-NL")} keer gemaakt door leerlingen`;
  return `Deze toets is ${made} en kan daarom niet worden verwijderd. Archiveer hem; dan verdwijnt hij uit je lijst en blijven alle resultaten bewaard.`;
}
