import type { Metadata } from "next";
import { type ReactNode, Suspense } from "react";
import { CurrentUserProvider } from "@/components/app/current-user";
import { LoadingState } from "@/components/app/states";
import { UserMenu } from "@/components/app/user-menu";
import { DocentShell } from "@/components/layout/docent-shell";
import { toShellUser } from "@/components/layout/to-shell-user";
import { UserMenuSkeleton } from "@/components/layout/user-menu-skeleton";
import { requireAdmin } from "@/server/session";

export const metadata: Metadata = {
  title: { default: "Docent", template: "%s · Pensuma" },
};

/**
 * Teacher area. The shell (sidebar, top bar) is static and prerendered; the
 * session is only read inside <Suspense> boundaries:
 *  - <DocentUserMenu> streams the account menu into the sidebar footer;
 *  - <DocentGate> verifies the teacher before rendering the page, and
 *    provides the user to client components via useCurrentUser().
 * requireAdmin() is request-deduped, so the session is read once.
 */
export default function DocentLayout({ children }: { children: ReactNode }) {
  return (
    <DocentShell
      userMenu={
        <Suspense fallback={<UserMenuSkeleton variant="sidebar" />}>
          <DocentUserMenu />
        </Suspense>
      }
    >
      <Suspense fallback={<LoadingState />}>
        <DocentGate>{children}</DocentGate>
      </Suspense>
    </DocentShell>
  );
}

async function DocentUserMenu() {
  const user = await requireAdmin();
  return (
    <UserMenu
      user={toShellUser(user)}
      variant="sidebar"
      accountHref="/docent/account"
    />
  );
}

async function DocentGate({ children }: { children: ReactNode }) {
  const user = await requireAdmin();
  return (
    <CurrentUserProvider user={toShellUser(user)}>
      {children}
    </CurrentUserProvider>
  );
}
