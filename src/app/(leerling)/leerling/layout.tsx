import type { Metadata } from "next";
import { type ReactNode, Suspense } from "react";
import { CurrentUserProvider } from "@/components/app/current-user";
import { LoadingState } from "@/components/app/states";
import { UserMenu } from "@/components/app/user-menu";
import { LeerlingShell } from "@/components/layout/leerling-shell";
import { toShellUser } from "@/components/layout/to-shell-user";
import { UserMenuSkeleton } from "@/components/layout/user-menu-skeleton";
import { requireStudent } from "@/server/session";

export const metadata: Metadata = {
  title: { default: "Leerling", template: "%s · Pensuma" },
};

/**
 * Student area (everything under /leerling except the exam pages, which live
 * in the (leerling-exam) route group without this navigation).
 * Same pattern as the teacher layout: static shell, session read in Suspense.
 */
export default function LeerlingLayout({ children }: { children: ReactNode }) {
  return (
    <LeerlingShell
      userMenu={
        <Suspense fallback={<UserMenuSkeleton variant="header" />}>
          <LeerlingUserMenu />
        </Suspense>
      }
    >
      <Suspense fallback={<LoadingState />}>
        <LeerlingGate>{children}</LeerlingGate>
      </Suspense>
    </LeerlingShell>
  );
}

async function LeerlingUserMenu() {
  const user = await requireStudent();
  return <UserMenu user={toShellUser(user)} variant="header" />;
}

async function LeerlingGate({ children }: { children: ReactNode }) {
  const user = await requireStudent();
  return (
    <CurrentUserProvider user={toShellUser(user)}>
      {children}
    </CurrentUserProvider>
  );
}
