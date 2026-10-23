/**
 * Dutch sentences with counts for the class pages, so "Alle 1 afname …
 * worden" or "Alle 1 leerling krijgen" can't happen.
 */
import { plural } from "../students/format";

/** Confirm text for deleting a class (with or without afnames). */
export function deleteClassDescription(assignmentCount: number): string {
  const rest =
    "De leerlingaccounts blijven bestaan. Dit kun je niet ongedaan maken.";
  if (assignmentCount <= 0) return `De klas wordt verwijderd. ${rest}`;
  const lead =
    assignmentCount === 1
      ? "De afname van deze klas wordt verwijderd"
      : `Alle ${plural(assignmentCount, "afname", "afnames")} van deze klas worden verwijderd`;
  return `${lead}, inclusief alle pogingen, antwoorden en cijfers. ${rest} Overweeg archiveren.`;
}

/** Confirm text for "Alle pincodes resetten". */
export function resetPinsDescription(memberCount: number): string {
  if (memberCount <= 0) return "Er zitten nog geen leerlingen in deze klas.";
  return memberCount === 1
    ? "De leerling in deze klas krijgt een nieuwe pincode en wordt uitgelogd. De oude inlogkaart werkt daarna niet meer."
    : `Alle ${plural(memberCount, "leerling", "leerlingen")} krijgen een nieuwe pincode en worden uitgelogd. Hun oude inlogkaarten werken daarna niet meer.`;
}
