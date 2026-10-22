"use client";

import { useQueryClient } from "@tanstack/react-query";
import { ChevronsUpDown, LogOut, Palette, UserRound } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
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
import { signOut } from "@/lib/auth-client";
import { ROUTES } from "@/lib/auth-shared";
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

/** Account dropdown: who is signed in, account link, theme, sign out. */
export function UserMenu({
  user,
  variant = "sidebar",
  accountHref,
  className,
}: UserMenuProps) {
  const { theme, setTheme } = useTheme();
  const queryClient = useQueryClient();
  const [signingOut, setSigningOut] = useState(false);
  const isStudent = user.role === "student";
  const subtitle = isStudent
    ? user.username
      ? `Leerlingnummer ${user.username}`
      : "Leerling"
    : user.email;

  async function handleSignOut() {
    setSigningOut(true);
    const { error } = await signOut();
    if (error) {
      setSigningOut(false);
      toast.error("Uitloggen lukte niet. Probeer het opnieuw.");
      return;
    }
    queryClient.clear();
    // Full navigation so every server component re-renders without the session.
    window.location.assign(ROUTES.login);
  }

  const trigger =
    variant === "sidebar" ? (
      <button
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
        type="button"
        className={cn(
          "flex items-center gap-2 rounded-full p-0.5 pr-0.5 text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/50 data-[state=open]:bg-accent sm:pr-3",
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
    <DropdownMenu>
      <DropdownMenuTrigger asChild>{trigger}</DropdownMenuTrigger>
      <DropdownMenuContent
        align={variant === "sidebar" ? "start" : "end"}
        side={variant === "sidebar" ? "top" : "bottom"}
        sideOffset={8}
        className="w-64"
      >
        <DropdownMenuLabel className="flex items-center gap-3 px-2 py-2 font-normal">
          <UserAvatar name={user.name} className="size-9" />
          <span className="grid min-w-0 leading-tight">
            <span className="truncate text-sm font-semibold">{user.name}</span>
            <span className="truncate text-xs text-muted-foreground">
              {subtitle}
            </span>
          </span>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        <DropdownMenuGroup>
          {accountHref ? (
            <DropdownMenuItem asChild>
              <Link href={accountHref}>
                <UserRound aria-hidden="true" />
                Account
              </Link>
            </DropdownMenuItem>
          ) : null}
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
  );
}
