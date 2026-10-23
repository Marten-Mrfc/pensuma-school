"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { resetPreferences } from "@/components/preferences/preferences-store";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { signOut } from "@/lib/auth-client";
import { ROUTES } from "@/lib/auth-shared";
import { clearLocalUserData } from "@/lib/local-data";
import { useTRPC } from "@/trpc/react";
import { ChangePasswordForm } from "./change-password-form";

export interface PasswordChangeGateProps {
  /** From the server session, so the dialog shows without a flash. */
  initialRequired: boolean;
  email: string;
  name: string;
}

/**
 * Teachers signed in with a temporary password must choose their own
 * first. The server blocks every other teacher procedure meanwhile
 * ("Wijzig eerst je tijdelijke wachtwoord."); this dialog cannot be
 * dismissed, only completed or left by signing out.
 */
export function PasswordChangeGate({
  initialRequired,
  email,
  name,
}: PasswordChangeGateProps) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const me = useQuery(trpc.staff.me.queryOptions());
  const [signingOut, setSigningOut] = useState(false);
  const required = me.data ? me.data.passwordChangeRequired : initialRequired;

  async function leave() {
    setSigningOut(true);
    await signOut().catch(() => undefined);
    // Shared school computers: same clean-up as the account menu.
    resetPreferences();
    clearLocalUserData();
    queryClient.clear();
    window.location.assign(`${ROUTES.login}?rol=docent`);
  }

  return (
    <Dialog open={required} onOpenChange={() => undefined}>
      <DialogContent
        showCloseButton={false}
        className="sm:max-w-md"
        onEscapeKeyDown={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Kies een eigen wachtwoord</DialogTitle>
          <DialogDescription>
            Je bent ingelogd met een tijdelijk wachtwoord. Kies nu een eigen
            wachtwoord om verder te gaan.
          </DialogDescription>
        </DialogHeader>
        <ChangePasswordForm
          email={me.data?.email ?? email}
          name={me.data?.name ?? name}
          autoFocus
          submitLabel="Wachtwoord opslaan"
          onChanged={() => void me.refetch()}
        />
        <div className="flex justify-end border-t pt-3">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => void leave()}
            disabled={signingOut}
          >
            <LogOut aria-hidden="true" />
            Uitloggen
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
