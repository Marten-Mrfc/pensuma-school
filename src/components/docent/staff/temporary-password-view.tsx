"use client";

import { TriangleAlert } from "lucide-react";
import { CopyButton } from "@/components/app/copy-button";

/** A temporary password, shown once, with copy buttons. */
export function TemporaryPasswordView({
  email,
  password,
}: {
  email: string;
  password: string;
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 rounded-xl border bg-muted/40 p-4">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          Tijdelijk wachtwoord
        </span>
        <div className="flex items-center justify-between gap-2">
          <output className="font-mono text-xl font-medium break-all text-foreground">
            {password}
          </output>
          <CopyButton value={password} successMessage="Wachtwoord gekopieerd" />
        </div>
        <CopyButton
          value={`E-mailadres: ${email}\nTijdelijk wachtwoord: ${password}`}
          label="Kopieer inloggegevens"
          variant="outline"
          className="w-fit"
          successMessage="Inloggegevens gekopieerd"
        />
      </div>
      <p className="flex items-start gap-2 text-xs leading-relaxed text-warning-ink">
        <TriangleAlert className="mt-px size-3.5 shrink-0" aria-hidden="true" />
        Dit wachtwoord wordt maar één keer getoond. Vraag de docent om het na
        het inloggen te wijzigen via Mijn account.
      </p>
    </div>
  );
}
