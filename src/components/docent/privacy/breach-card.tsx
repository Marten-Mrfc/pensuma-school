"use client";

import { useMutation } from "@tanstack/react-query";
import { Download, LogOut, Siren } from "lucide-react";
import { useId, useState } from "react";
import { toast } from "sonner";
import { useAnnounce } from "@/components/a11y/live-announcer";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { FormField } from "@/components/app/form-field";
import { getErrorMessage } from "@/components/app/get-error-message";
import { Button } from "@/components/ui/button";
import { PasswordInput } from "@/components/ui/password-input";
import { downloadTextFile } from "@/lib/export/download";
import { useTRPC } from "@/trpc/react";

/** Datalek: who to inform, export the log, sign everybody out. */
export function BreachCard({ dpoEmail }: { dpoEmail: string | null }) {
  const trpc = useTRPC();
  const announce = useAnnounce();
  const passwordId = useId();
  const [password, setPassword] = useState("");
  const exportLog = useMutation(trpc.privacy.exportAuditLog.mutationOptions());
  const revoke = useMutation(trpc.privacy.revokeAllSessions.mutationOptions());

  async function handleExport() {
    try {
      const result = await exportLog.mutateAsync({});
      downloadTextFile(result.filename, result.csv);
      const message = `Logboek van de afgelopen 31 dagen gedownload (${result.rowCount} regels).`;
      toast.success(message);
      announce(message);
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  return (
    <section
      aria-labelledby={`${passwordId}-titel`}
      className="flex flex-col gap-4 rounded-xl border border-destructive/25 bg-destructive/[0.035] p-4 sm:flex-row sm:items-start sm:gap-5 sm:p-6"
    >
      <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-destructive/10 text-destructive-ink">
        <Siren className="size-5" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-3">
        <div className="flex flex-col gap-1">
          <h2
            id={`${passwordId}-titel`}
            className="font-display text-lg font-semibold tracking-tight text-foreground"
          >
            Datalek of vermoeden van een datalek?
          </h2>
          <p className="max-w-2xl text-sm leading-relaxed text-pretty text-muted-foreground">
            Meld het direct bij de FG van je school
            {dpoEmail ? (
              <>
                {" "}
                (
                <a
                  href={`mailto:${dpoEmail}`}
                  className="font-medium text-primary underline underline-offset-[3px] hover:no-underline"
                >
                  {dpoEmail}
                </a>
                )
              </>
            ) : (
              " (vul het e-mailadres in bij Register & schoolgegevens)"
            )}
            . De school moet een datalek binnen 72 uur melden bij de Autoriteit
            Persoonsgegevens.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            onClick={handleExport}
            disabled={exportLog.isPending}
            aria-busy={exportLog.isPending}
          >
            <Download aria-hidden="true" />
            Logboek exporteren
          </Button>
          <ConfirmDialog
            destructive
            title="Alle sessies beëindigen?"
            description="Iedereen behalve jij wordt direct uitgelogd, ook leerlingen die nu een toets maken. Hun antwoorden blijven bewaard; ze kunnen opnieuw inloggen."
            confirmLabel="Alle sessies beëindigen"
            onOpenChange={(open) => {
              if (!open) setPassword("");
            }}
            trigger={
              <Button variant="destructive">
                <LogOut aria-hidden="true" />
                Alle sessies beëindigen
              </Button>
            }
            onConfirm={async () => {
              const result = await revoke.mutateAsync({ password });
              setPassword("");
              const message =
                result.revoked === 1
                  ? "1 sessie beëindigd."
                  : `${result.revoked} sessies beëindigd.`;
              toast.success(message);
              announce(message);
            }}
          >
            <FormField label="Je wachtwoord" htmlFor={passwordId} required>
              <PasswordInput
                id={passwordId}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete="current-password"
                placeholder=""
              />
            </FormField>
          </ConfirmDialog>
        </div>
      </div>
    </section>
  );
}
