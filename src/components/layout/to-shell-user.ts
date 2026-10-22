import type { ShellUser } from "@/components/app/current-user";

/** Narrow a server-side user to what client components may see. */
export function toShellUser(user: {
  id: string;
  name: string;
  email: string;
  role: string;
  username: string | null;
}): ShellUser {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    username: user.username,
  };
}
