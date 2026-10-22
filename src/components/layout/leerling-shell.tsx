"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { Logo } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { cn } from "@/lib/utils";
import { isLeerlingNavActive, LEERLING_NAV } from "./nav-config";

function TopNavLinks({ pathname }: { pathname: string | null }) {
  return (
    <ul className="flex items-center gap-1">
      {LEERLING_NAV.map((item) => {
        const active = isLeerlingNavActive(item, pathname);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "inline-flex h-9 items-center gap-2 rounded-full px-3.5 text-sm font-medium text-muted-foreground transition-colors outline-none hover:bg-accent/70 hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50",
                active &&
                  "bg-primary/10 text-primary hover:bg-primary/15 hover:text-primary",
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function BottomNavLinks({ pathname }: { pathname: string | null }) {
  return (
    <ul className="mx-auto grid max-w-md grid-cols-3">
      {LEERLING_NAV.map((item) => {
        const active = isLeerlingNavActive(item, pathname);
        const Icon = item.icon;
        return (
          <li key={item.href}>
            <Link
              href={item.href}
              aria-current={active ? "page" : undefined}
              className={cn(
                "flex flex-col items-center gap-1 rounded-xl py-2 text-[0.7rem] font-medium text-muted-foreground transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
                active && "text-primary",
              )}
            >
              <span
                className={cn(
                  "grid h-7 w-12 place-items-center rounded-full transition-colors",
                  active && "bg-primary/12",
                )}
              >
                <Icon className="size-[18px]" aria-hidden="true" />
              </span>
              {item.label}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function TopNav() {
  return <TopNavLinks pathname={usePathname()} />;
}

function BottomNav() {
  return <BottomNavLinks pathname={usePathname()} />;
}

export interface LeerlingShellProps {
  /** The account menu (streams in once the session is known). */
  userMenu: ReactNode;
  children: ReactNode;
}

/** Student frame: light top navigation on desktop, bottom tab bar on phones. */
export function LeerlingShell({ userMenu, children }: LeerlingShellProps) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-40 border-b bg-background/80 backdrop-blur-md supports-[backdrop-filter]:bg-background/70">
        <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-6 px-4 sm:px-6">
          <Logo href="/leerling" size="sm" />
          <nav aria-label="Hoofdmenu" className="hidden md:block">
            <Suspense fallback={<TopNavLinks pathname={null} />}>
              <TopNav />
            </Suspense>
          </nav>
          <div className="ml-auto flex items-center gap-1.5">
            <ThemeToggle />
            {userMenu}
          </div>
        </div>
      </header>

      <main
        id="inhoud"
        className="flex-1 px-4 pt-6 pb-28 sm:px-6 md:pt-10 md:pb-16"
      >
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-6">
          {children}
        </div>
      </main>

      <nav
        aria-label="Hoofdmenu"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-background/90 px-2 pt-1 pb-[max(0.25rem,env(safe-area-inset-bottom))] backdrop-blur-md md:hidden"
      >
        <Suspense fallback={<BottomNavLinks pathname={null} />}>
          <BottomNav />
        </Suspense>
      </nav>
    </div>
  );
}
