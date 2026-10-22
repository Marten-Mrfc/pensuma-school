"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTheme } from "@/lib/use-theme";
import { cn } from "@/lib/utils";

export type ThemeChoice = "light" | "dark" | "system";

export const THEME_OPTIONS: {
  value: ThemeChoice;
  label: string;
  icon: typeof Sun;
}[] = [
  { value: "light", label: "Licht", icon: Sun },
  { value: "dark", label: "Donker", icon: Moon },
  { value: "system", label: "Systeem", icon: Monitor },
];

const subscribeNoop = () => () => {};

/** True after hydration; the theme is unknown on the server. */
function useMounted() {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

export interface ThemeToggleProps {
  /**
   * - `icon` (default): one icon button that switches light ⇄ dark.
   * - `segmented`: three buttons (Licht / Donker / Systeem).
   */
  variant?: "icon" | "segmented";
  className?: string;
}

/** Theme switch with Dutch labels. */
export function ThemeToggle({ variant = "icon", className }: ThemeToggleProps) {
  const { theme, resolvedTheme, setTheme } = useTheme();
  const mounted = useMounted();
  const current = (mounted ? theme : undefined) as ThemeChoice | undefined;

  if (variant === "segmented") {
    return (
      <div
        role="radiogroup"
        aria-label="Thema"
        className={cn(
          "inline-flex items-center gap-0.5 rounded-lg border bg-muted/60 p-0.5",
          className,
        )}
      >
        {THEME_OPTIONS.map(({ value, label, icon: Icon }) => {
          const active = current === value;
          return (
            // biome-ignore lint/a11y/useSemanticElements: segmented radio buttons
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => setTheme(value)}
              className={cn(
                "inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
                active && "bg-background text-foreground shadow-xs",
              )}
            >
              <Icon className="size-3.5" aria-hidden="true" />
              {label}
            </button>
          );
        })}
      </div>
    );
  }

  const isDark = mounted && resolvedTheme === "dark";
  const label = isDark ? "Licht thema gebruiken" : "Donker thema gebruiken";

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={label}
          className={cn(
            "text-muted-foreground hover:text-foreground",
            className,
          )}
          onClick={() => setTheme(isDark ? "light" : "dark")}
        >
          <Sun className="hidden size-4 dark:block" aria-hidden="true" />
          <Moon className="size-4 dark:hidden" aria-hidden="true" />
        </Button>
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
