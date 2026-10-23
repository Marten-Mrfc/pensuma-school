"use client";

import { createContext, type ReactNode, use, useState } from "react";
import { PreferencesSync } from "@/components/preferences/preferences-sync";
import { claimLocalData } from "@/lib/local-data";

/** The signed-in user as exposed to client components (no secrets). */
export type ShellUser = {
  id: string;
  name: string;
  /** Real e-mail for teachers; a placeholder address for students (don't show it). */
  email: string;
  role: "admin" | "student" | (string & {});
  /** Student number (leerlingnummer) for students, null for teachers. */
  username: string | null;
};

const CurrentUserContext = createContext<ShellUser | null>(null);

/** Browser only: claim this browser's "pensuma:" keys for `userId`. */
function claimFor(userId: string): string {
  if (typeof window !== "undefined") claimLocalData(userId);
  return userId;
}

/**
 * Provided by the /docent, /leerling and exam layouts once the session has
 * been verified on the server, so pages can greet the user without a fetch.
 * It also mounts PreferencesSync, which applies the user's display
 * preferences (text size, readable font, …) to the page.
 *
 * Before anything below it reads the browser's storage, the "pensuma:" keys
 * are claimed for this user (claimLocalData): on a shared school computer the
 * previous student's practice code and answer backups are cleared, also when
 * they closed the browser instead of signing out.
 */
export function CurrentUserProvider({
  user,
  children,
}: {
  user: ShellUser;
  children: ReactNode;
}) {
  // During render, not in an effect: children render after their parent but
  // run their effects (and read storage in state initialisers) before it.
  const [claimedFor, setClaimedFor] = useState(() => claimFor(user.id));
  if (claimedFor !== user.id) setClaimedFor(claimFor(user.id));

  return (
    <CurrentUserContext value={user}>
      <PreferencesSync userId={user.id} />
      {children}
    </CurrentUserContext>
  );
}

/** The signed-in user, or null outside the /docent, /leerling and exam layouts. */
export function useOptionalCurrentUser(): ShellUser | null {
  return use(CurrentUserContext);
}

/**
 * The signed-in user inside /docent/* and /leerling/* pages.
 * Throws when used outside those layouts.
 */
export function useCurrentUser(): ShellUser {
  const user = use(CurrentUserContext);
  if (!user) {
    throw new Error(
      "useCurrentUser() werkt alleen binnen de /docent- of /leerling-layout.",
    );
  }
  return user;
}
