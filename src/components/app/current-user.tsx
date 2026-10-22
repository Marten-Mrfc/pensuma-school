"use client";

import { createContext, type ReactNode, use } from "react";

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
 * Provided by the /docent and /leerling layouts once the session has been
 * verified on the server, so pages can greet the user without a fetch.
 */
export function CurrentUserProvider({
  user,
  children,
}: {
  user: ShellUser;
  children: ReactNode;
}) {
  return <CurrentUserContext value={user}>{children}</CurrentUserContext>;
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
