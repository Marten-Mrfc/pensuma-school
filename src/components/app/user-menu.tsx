"use client";

import { useQueryClient } from "@tanstack/react-query";
import {
  Accessibility,
  ChevronsUpDown,
  FileUser,
  Keyboard,
  LogOut,
  Palette,
  ShieldCheck,
  Type,
  UserRound,
} from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";
import { ShortcutsDialog } from "@/components/a11y/shortcuts-dialog";
import { DisplayPreferencesDialog } from "@/components/preferences/display-preferences-dialog";
import {
  flushPendingPreferences,
  resetPreferences,
} from "@/components/preferences/preferences-store";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { toastError } from "@/components/ui/sonner";
import { signOut } from "@/lib/auth-client";
import { ROUTES } from "@/lib/auth-shared";
import { clearLocalUserData } from "@/lib/local-data";
import { routes } from "@/lib/routes";
import { useTheme } from "@/lib/use-theme";
import { cn } from "@/lib/utils";
import type { ShellUser } from "./current-user";
import { THEME_OPTIONS } from "./theme-toggle";

export interface UserMenuProps {
  user: Pick<ShellUser, "name" | "email" | "role" | "username">;
  /** `sidebar`: full-width row with name + e-mail. `header`: compact avatar button. */
  variant?: "sidebar" | "header";
  /** Shows an "Account" item linking here. */
  accountHref?: string;
  className?: string;
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const last = parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "";
  return (first + last).toUpperCase();
}

function UserAvatar({ name, className }: { name: string; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "grid size-8 shrink-0 place-items-center rounded-full bg-primary/12 text-xs font-semibold text-primary ring-1 ring-primary/20",
        className,
      )}
    >
      {initials(name)}
    </span>
  );
}

type MenuDialog = "preferences" | "shortcuts";

/**
 * Account dropdown: who is signed in, account link, display preferences,
 * theme, shortcuts, help links (same order in every shell, WCAG 3.2.6) and
 * sign out.
 */
export function UserMenu({
  user,
  variant = "sidebar",
  accountHref,
  className,
}: UserMenuProps) {
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const [dialog, setDialog] = useState<MenuDialog | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  // A dialog opened from the menu takes focus itself; the menu must not
  // pull focus back to its trigger while it closes.
  const dialogPending = useRef(false);

  function openDialog(which: MenuDialog) {
    dialogPending.current = true;
    setDialog(which);
  }
  const isStudent = user.role === "student";
  const subtitle = isStudent
    ? user.username
      ? `Leerlingnummer ${user.username}`
      : "Leerling"
    : user.email;

  async function handleSignOut() {
    setSigningOut(true);
    // A display-preference change still waiting to be saved goes out now,
    // while the session exists.
    await flushPendingPreferences();
    const { error } = await signOut();
    if (error) {
      setSigningOut(false);
      toastError("Uitloggen lukte niet. Probeer het opnieuw.");
      return;
    }
    // Shared school computers: remove preferences, drafts and backups first.
    resetPreferences();
    clearLocalUserData();
    queryClient.clear();
    // Full navigation so every server component re-renders without the session.
    window.location.assign(ROUTES.login);
  }

  const trigger =
    variant === "sidebar" ? (
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          "flex w-full items-center gap-2.5 rounded-lg p-2 text-left text-sm outline-none transition-colors hover:bg-sidebar-accent focus-visible:ring-2 focus-visible:ring-sidebar-ring data-[state=open]:bg-sidebar-accent group-data-[collapsible=icon]:size-8 group-data-[collapsible=icon]:p-0",
          className,
        )}
      >
        <UserAvatar name={user.name} />
        <span className="grid min-w-0 flex-1 leading-tight group-data-[collapsible=icon]:hidden">
          <span className="truncate font-medium">{user.name}</span>
          <span className="truncate text-xs text-muted-foreground">
            {subtitle}
          </span>
        </span>
        <ChevronsUpDown
          className="size-4 shrink-0 text-muted-foreground group-data-[collapsible=icon]:hidden"
          aria-hidden="true"
        />
        <span className="sr-only">Accountmenu openen</span>
      </button>
    ) : (
      <button
        ref={triggerRef}
        type="button"
        className={cn(
          "flex items-center gap-2 rounded-full p-0.5 pr-0.5 text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring data-[state=open]:bg-accent sm:pr-3",
          className,
        )}
      >
        <UserAvatar name={user.name} />
        <span className="hidden max-w-[10rem] truncate font-medium sm:block">
          {user.name.split(" ")[0]}
        </span>
        <span className="sr-only">Accountmenu openen</span>
      </button>
    );

  return (
    <>
      {/* Non-modal: a modal menu sets aria-hidden on the rest of the page
          while focusable controls stay in it (axe aria-hidden-focus). The
          menu still closes on Escape, outside click and focus leaving it. */}
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
        <DropdownMenuContent
          align={variant === "sidebar" ? "start" : "end"}
          side={variant === "sidebar" ? "top" : "bottom"}
          sideOffset={8}
          className="w-64"
          onCloseAutoFocus={(e) => {
            if (dialogPending.current) {
              dialogPending.current = false;
              e.preventDefault();
            }
          }}
        >
          <DropdownMenuLabel className="flex items-center gap-3 px-2 py-2 font-normal">
            <UserAvatar name={user.name} className="size-9" />
            <span className="grid min-w-0 leading-tight">
              <span className="truncate text-sm font-semibold">
                {user.name}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {subtitle}
              </span>
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          {accountHref ? (
            <>
              <DropdownMenuGroup>
                <DropdownMenuItem asChild>
                  <Link href={accountHref}>
                    <UserRound aria-hidden="true" />
                    Account
                  </Link>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
            </>
          ) : null}
          <DropdownMenuGroup>
            <DropdownMenuItem onSelect={() => openDialog("preferences")}>
              <Type aria-hidden="true" />
              Weergave en leesbaarheid
            </DropdownMenuItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="gap-2">
                <Palette
                  className="size-4 text-muted-foreground"
                  aria-hidden="true"
                />
                Thema
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="w-40">
                <DropdownMenuRadioGroup
                  value={theme ?? "system"}
                  onValueChange={setTheme}
                >
                  {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
                    <DropdownMenuRadioItem
                      key={value}
                      value={value}
                      className="gap-2"
                    >
                      <Icon
                        className="size-4 text-muted-foreground"
                        aria-hidden="true"
                      />
                      {label}
                    </DropdownMenuRadioItem>
                  ))}
                </DropdownMenuRadioGroup>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuItem onSelect={() => openDialog("shortcuts")}>
              <Keyboard aria-hidden="true" />
              Sneltoetsen
            </DropdownMenuItem>
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuGroup>
            <DropdownMenuItem asChild>
              <Link href={routes.accessibility}>
                <Accessibility aria-hidden="true" />
                Toegankelijkheid
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem asChild>
              <Link href={routes.privacy}>
                <ShieldCheck aria-hidden="true" />
                Privacyverklaring
              </Link>
            </DropdownMenuItem>
            {isStudent ? (
              <DropdownMenuItem asChild>
                <Link href={routes.leerling.myData}>
                  <FileUser aria-hidden="true" />
                  Mijn gegevens
                </Link>
              </DropdownMenuItem>
            ) : null}
          </DropdownMenuGroup>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={signingOut}
            onSelect={(e) => {
              e.preventDefault();
              void handleSignOut();
            }}
          >
            <LogOut aria-hidden="true" />
            {signingOut ? "Bezig met uitloggen…" : "Uitloggen"}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <DisplayPreferencesDialog
        open={dialog === "preferences"}
        onOpenChange={(open) => setDialog(open ? "preferences" : null)}
        returnFocusRef={triggerRef}
      />
      <ShortcutsDialog
        open={dialog === "shortcuts"}
        onOpenChange={(open) => setDialog(open ? "shortcuts" : null)}
        returnFocusRef={triggerRef}
      />
    </>
  );
}
