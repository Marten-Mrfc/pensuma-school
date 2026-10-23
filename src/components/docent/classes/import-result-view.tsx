"use client";

import { CircleAlert, CircleCheck, Printer, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { useId } from "react";
import { CopyButton } from "@/components/app/copy-button";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { formatPin, plural, restrictedSkipNote } from "../students/format";
import type { ImportContext, ImportResult } from "./import-students-panel";

type ExistingRow = ImportResult["existing"][number];

/**
 * Did the import leave this student alone because their processing is
 * restricted (AVG art. 18)? Not when they were already in the class and no
 * new name was asked for: then nothing would have changed anyway. Without
 * a context every restricted student counts as skipped.
 */
export function skippedForRestriction(
  e: ExistingRow,
  context?: ImportContext,
): boolean {
  if (!e.restricted) return false;
  if (!context?.alreadyInClass.has(e.id)) return true;
  return context.renameAsked && e.importedName !== e.name;
}

/** What the import did with a student who already had an account. */
export function existingStatusText(
  e: ExistingRow,
  context?: ImportContext,
): string {
  // AVG art. 18: neither the name nor the klasindeling may change.
  if (e.restricted && !context?.alreadyInClass.has(e.id))
    return "Niet toegevoegd en niet hernoemd: verwerking beperkt (AVG art. 18)";
  if (skippedForRestriction(e, context))
    return "Zat al in de klas · naam niet bijgewerkt: verwerking beperkt (AVG art. 18)";
  const status = e.addedToClass
    ? "Toegevoegd aan de klas"
    : "Zat al in de klas";
  return e.nameUpdated ? `${status} · naam bijgewerkt` : status;
}

export interface ImportResultViewProps {
  classId: string;
  className: string;
  result: ImportResult;
  /** Who was already in the class and whether names were to be updated. */
  context?: ImportContext;
  onImportMore: () => void;
  onDone: () => void;
}

/** Shown after an import: new students with their PINs and a big print button. */
export function ImportResultView({
  classId,
  className,
  result,
  context,
  onImportMore,
  onDone,
}: ImportResultViewProps) {
  const uid = useId();
  const { created, existing, errors } = result;
  const addedExisting = existing.filter((e) => e.addedToClass);
  const restrictedCount = existing.filter((e) =>
    skippedForRestriction(e, context),
  ).length;
  const total = created.length + addedExisting.length;
  const printIds = [
    ...created.map((c) => c.id),
    ...addedExisting.map((e) => e.id),
  ];
  const printHref =
    printIds.length > 0
      ? `${routes.docent.classLoginCards(classId)}?ids=${printIds.map(encodeURIComponent).join(",")}`
      : routes.docent.classLoginCards(classId);
  const asTable = created
    .map((c) => `${c.studentNumber}\t${c.name}\t${c.pin}`)
    .join("\n");

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 pb-4 sm:px-6">
        <div className="flex items-start gap-3 rounded-xl border border-success/25 bg-success/[0.06] p-4">
          <CircleCheck
            className="mt-0.5 size-5 shrink-0 text-success-ink"
            aria-hidden="true"
          />
          <div className="flex flex-col gap-0.5">
            <p className="font-semibold">
              {total > 0
                ? `${plural(total, "leerling", "leerlingen")} toegevoegd aan ${className}`
                : "Er zijn geen leerlingen toegevoegd"}
            </p>
            <p className="text-sm text-muted-foreground">
              {created.length > 0
                ? `${plural(created.length, "nieuw account", "nieuwe accounts")} met pincode`
                : "Geen nieuwe accounts"}
              {existing.length > 0
                ? ` · ${plural(existing.length, "bestaande leerling", "bestaande leerlingen")}`
                : ""}
              {errors.length > 0
                ? ` · ${plural(errors.length, "fout", "fouten")}`
                : ""}
            </p>
          </div>
        </div>

        {restrictedCount > 0 ? (
          <p className="flex items-start gap-2 rounded-lg border border-warning/35 bg-warning/10 px-3 py-2 text-sm text-pretty">
            <ShieldAlert
              className="mt-0.5 size-4 shrink-0 text-warning-ink"
              aria-hidden="true"
            />
            <span>
              {restrictedSkipNote(restrictedCount)} Naam en klassen blijven
              ongewijzigd.
            </span>
          </p>
        ) : null}

        {total > 0 ? (
          <Button asChild size="lg" className="h-12 w-full text-base">
            <Link href={printHref} target="_blank" rel="noopener">
              <Printer className="size-5" aria-hidden="true" />
              Inlogkaarten printen ({total})
            </Link>
          </Button>
        ) : null}

        {created.length > 0 ? (
          <section
            className="flex flex-col gap-2"
            aria-labelledby={`${uid}-created-heading`}
          >
            <div className="flex items-center justify-between gap-2">
              <h3
                id={`${uid}-created-heading`}
                className="text-sm font-semibold"
              >
                Nieuwe accounts
              </h3>
              <CopyButton
                value={asTable}
                label="Kopieer als tabel"
                successMessage="Tabel gekopieerd"
              />
            </div>
            <div className="overflow-hidden rounded-lg border">
              <div className="max-h-[38vh] overflow-auto">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-muted">
                    <tr className="text-left text-xs text-muted-foreground">
                      <th scope="col" className="px-3 py-2 font-medium">
                        Nummer
                      </th>
                      <th scope="col" className="px-3 py-2 font-medium">
                        Naam
                      </th>
                      <th
                        scope="col"
                        className="px-3 py-2 text-right font-medium"
                      >
                        Pincode
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {created.map((c) => (
                      <tr key={c.id} className="border-t">
                        <td className="px-3 py-2 font-mono text-xs tabular-nums">
                          {c.studentNumber}
                        </td>
                        <td className="px-3 py-2">{c.name}</td>
                        <td className="px-3 py-2 text-right font-mono tracking-[0.14em] tabular-nums">
                          {formatPin(c.pin)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Je kunt de pincodes later altijd opnieuw bekijken of printen
              vanuit de klas.
            </p>
          </section>
        ) : null}

        {existing.length > 0 ? (
          <section
            className="flex flex-col gap-2"
            aria-labelledby={`${uid}-existing-heading`}
          >
            <h3
              id={`${uid}-existing-heading`}
              className="text-sm font-semibold"
            >
              Bestaande leerlingen
            </h3>
            <ul className="divide-y rounded-lg border text-sm">
              {existing.map((e) => (
                <li
                  key={e.id}
                  className="flex flex-wrap items-center justify-between gap-x-3 gap-y-0.5 px-3 py-2"
                >
                  <span>
                    <span className="font-medium">{e.name}</span>{" "}
                    <span className="font-mono text-xs text-muted-foreground">
                      {e.studentNumber}
                    </span>
                  </span>
                  <span
                    className={cn(
                      "text-xs",
                      skippedForRestriction(e, context)
                        ? "font-medium text-warning-ink"
                        : "text-muted-foreground",
                    )}
                  >
                    {existingStatusText(e, context)}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {errors.length > 0 ? (
          <section
            className="flex flex-col gap-2"
            aria-labelledby={`${uid}-errors-heading`}
          >
            <h3
              id={`${uid}-errors-heading`}
              className="flex items-center gap-1.5 text-sm font-semibold text-destructive-ink"
            >
              <CircleAlert className="size-4" aria-hidden="true" />
              Niet geïmporteerd
            </h3>
            <ul className="divide-y rounded-lg border border-destructive/20 text-sm">
              {errors.map((e) => (
                <li
                  key={`${e.row}-${e.studentNumber}`}
                  className="flex gap-3 px-3 py-2"
                >
                  <span className="font-mono text-xs text-muted-foreground tabular-nums">
                    regel {e.row}
                  </span>
                  <span>{e.message}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </div>

      <div className="flex flex-col-reverse gap-2 border-t bg-background px-4 py-3 sm:flex-row sm:justify-between sm:px-6">
        <Button variant="outline" onClick={onImportMore}>
          Nog een lijst importeren
        </Button>
        <Button onClick={onDone}>Klaar</Button>
      </div>
    </div>
  );
}
