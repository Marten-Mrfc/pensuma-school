"use client";

import { PanelLeft, X } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { type ReactNode, Suspense } from "react";
import { LogoMark } from "@/components/app/logo";
import { ThemeToggle } from "@/components/app/theme-toggle";
import { Button } from "@/components/ui/button";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarInset,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarProvider,
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { DOCENT_NAV, isNavActive } from "./nav-config";

/* ------------------------------------------------------------------ */
/* Navigation (pathname-aware parts live behind <Suspense>: usePathname */
/* suspends on routes with dynamic params under cacheComponents).      */
/* ------------------------------------------------------------------ */

function DocentNavGroups({ pathname }: { pathname: string | null }) {
  const { isMobile, setOpenMobile } = useSidebar();
  return (
    <>
      {DOCENT_NAV.map((group) => (
        <SidebarGroup key={group.label} className="py-1">
          {group.items.length > 1 ? (
            <SidebarGroupLabel className="text-xs font-medium text-sidebar-foreground/70">
              {group.label}
            </SidebarGroupLabel>
          ) : null}
          <SidebarGroupContent>
            <SidebarMenu>
              {group.items.map((item) => {
                const active = isNavActive(item, pathname);
                const Icon = item.icon;
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton
                      asChild
                      isActive={active}
                      tooltip={item.label}
                      className={cn(
                        "h-9 gap-3 rounded-lg px-2.5 text-[0.9rem] transition-colors",
                        "data-[active=true]:bg-sidebar-primary/10 data-[active=true]:font-semibold data-[active=true]:text-sidebar-primary",
                        "data-[active=true]:[&>svg]:text-sidebar-primary",
                      )}
                    >
                      <Link
                        href={item.href}
                        aria-current={active ? "page" : undefined}
                        onClick={() => {
                          if (isMobile) setOpenMobile(false);
                        }}
                      >
                        <Icon aria-hidden="true" />
                        <span>{item.label}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                );
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      ))}
    </>
  );
}

function DocentNav() {
  const pathname = usePathname();
  return <DocentNavGroups pathname={pathname} />;
}

function CurrentSection() {
  const pathname = usePathname();
  const item = DOCENT_NAV.flatMap((g) => g.items).find((i) =>
    isNavActive(i, pathname),
  );
  const label =
    item?.label ?? (pathname?.startsWith("/docent/account") ? "Account" : null);
  if (!label) return null;
  return (
    <span className="truncate text-sm font-medium text-foreground">
      {label}
    </span>
  );
}

function ShellTrigger() {
  const { toggleSidebar, isMobile, open, openMobile } = useSidebar();
  const label = isMobile
    ? "Menu openen"
    : open
      ? "Zijbalk inklappen"
      : "Zijbalk uitklappen";
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={toggleSidebar}
          aria-label={label}
          aria-expanded={isMobile ? openMobile : open}
          className="-ml-1 text-muted-foreground hover:text-foreground"
        >
          <PanelLeft aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent side="bottom">
        {label}
        <span className="ml-1.5 opacity-60">Ctrl+B</span>
      </TooltipContent>
    </Tooltip>
  );
}

/** Visible close control for the phone menu (the sheet hides its own). */
function MobileCloseButton() {
  const { isMobile, setOpenMobile } = useSidebar();
  if (!isMobile) return null;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label="Menu sluiten"
      onClick={() => setOpenMobile(false)}
      className="ml-auto shrink-0 text-muted-foreground hover:text-foreground"
    >
      <X aria-hidden="true" />
    </Button>
  );
}

/* ------------------------------------------------------------------ */
/* Shell                                                               */
/* ------------------------------------------------------------------ */

export interface DocentShellProps {
  /** The account menu (streams in once the session is known). */
  userMenu: ReactNode;
  children: ReactNode;
}

/** Teacher app frame: collapsible sidebar (sheet on phones) + top bar. */
export function DocentShell({ userMenu, children }: DocentShellProps) {
  return (
    <SidebarProvider className="bg-sidebar">
      <Sidebar collapsible="icon" variant="inset">
        <SidebarHeader className="flex-row items-center px-3 pt-4 pb-2 group-data-[collapsible=icon]:px-2">
          <Link
            href="/docent"
            aria-label="Pensuma, naar het dashboard"
            className="flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-2 focus-visible:ring-sidebar-ring"
          >
            <LogoMark className="size-8" />
            <span className="flex flex-col leading-none group-data-[collapsible=icon]:hidden">
              <span className="font-display-wide text-[1.15rem] font-bold">
                Pensuma
              </span>
              <span className="mt-1 text-xs text-muted-foreground">Docent</span>
            </span>
          </Link>
          <MobileCloseButton />
        </SidebarHeader>
        <SidebarContent className="pt-2">
          <nav aria-label="Hoofdmenu" className="flex flex-col">
            <Suspense fallback={<DocentNavGroups pathname={null} />}>
              <DocentNav />
            </Suspense>
          </nav>
        </SidebarContent>
        <SidebarFooter className="p-2">{userMenu}</SidebarFooter>
        <SidebarRail />
      </Sidebar>
      <SidebarInset className="min-h-svh md:min-h-[calc(100svh-1rem)] md:border">
        <header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-2 rounded-t-[inherit] border-b bg-background px-3 sm:px-5">
          <ShellTrigger />
          <span aria-hidden="true" className="mx-1 h-5 w-px bg-border" />
          <Link
            href="/docent"
            className="md:hidden"
            aria-label="Pensuma, naar het dashboard"
          >
            <LogoMark className="size-6" />
          </Link>
          <Suspense fallback={null}>
            <CurrentSection />
          </Suspense>
          <div className="ml-auto flex items-center gap-1">
            <ThemeToggle />
          </div>
        </header>
        <div
          id="inhoud"
          tabIndex={-1}
          className="flex-1 px-4 py-6 sm:px-6 md:py-8 lg:px-10"
        >
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
            {children}
          </div>
        </div>
      </SidebarInset>
    </SidebarProvider>
  );
}
