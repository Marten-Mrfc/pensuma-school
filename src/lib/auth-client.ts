import { usernameClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

/**
 * Browser auth client. Only sign-in, sign-out and the session are used:
 * every other better-auth endpoint is closed on the server (account
 * changes go through tRPC, e.g. staff.changeMyPassword).
 */
export const authClient = createAuthClient({
  plugins: [usernameClient()],
});

export const { useSession, signOut } = authClient;
