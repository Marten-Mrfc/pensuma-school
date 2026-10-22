"use client";

import { createContext, type ReactNode, use } from "react";
import { PreferencesSync } from "@/components/preferences/preferences-sync";

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

/**
 * Provided by the /docent, /leerling and exam layouts once the session has
 * been verified on the server, so pages can greet the user without a fetch.
 * It also mounts PreferencesSync, which applies the user's display
 * preferences (text size, readable font, …) to the page.
 */
export function CurrentUserProvider({
  user,
  children,
}: {
  user: ShellUser;
  children: ReactNode;
}) {
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
