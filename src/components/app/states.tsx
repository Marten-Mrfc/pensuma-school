import type { LucideIcon } from "lucide-react";
import { CircleAlert, Inbox, RotateCcw } from "lucide-react";
import { isValidElement, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "./get-error-message";

/* ------------------------------------------------------------------ */
/* LoadingState                                                        */
/* ------------------------------------------------------------------ */

export interface LoadingStateProps {
  /** Screen-reader text. Default "Laden…". */
  label?: string;
  /** `page` (default): header + stat row + list. `list`: rows only. `inline`: one compact line. */
  variant?: "page" | "list" | "inline";
  className?: string;
}

/** Page-shaped skeleton shown while data loads. */
export function LoadingState({
  label = "Laden…",
  variant = "page",
  className,
}: LoadingStateProps) {
  if (variant === "inline") {
    return (
      <output
        aria-busy="true"
        className={cn("flex items-center gap-3 py-3", className)}
      >
        <Skeleton className="size-4 rounded-full" />
        <Skeleton className="h-4 w-40" />
        <span className="sr-only">{label}</span>
      </output>
    );
  }

  const rows = (
    <div className="divide-y rounded-xl border bg-card">
      {[72, 56, 64, 48, 60].map((w) => (
        <div key={w} className="flex items-center gap-4 px-4 py-3.5">
          <Skeleton className="size-8 rounded-full" />
          <div className="flex flex-1 flex-col gap-2">
            <Skeleton className="h-3.5" style={{ width: `${w}%` }} />
            <Skeleton className="h-3 w-1/4" />
          </div>
          <Skeleton className="hidden h-6 w-20 rounded-full sm:block" />
        </div>
      ))}
    </div>
  );

  return (
    <output
      aria-busy="true"
      className={cn("flex w-full flex-col gap-6", className)}
    >
      <span className="sr-only">{label}</span>
      {variant === "page" ? (
        <>
          <div className="flex flex-col gap-3">
            <Skeleton className="h-8 w-64 max-w-full" />
            <Skeleton className="h-4 w-96 max-w-full" />
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div
                key={i}
                className="flex flex-col gap-3 rounded-xl border bg-card p-5"
              >
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-7 w-16" />
              </div>
            ))}
          </div>
        </>
      ) : null}
      {rows}
    </output>
  );
}

/* ------------------------------------------------------------------ */
/* ErrorState                                                          */
/* ------------------------------------------------------------------ */

export interface ErrorStateProps {
  title?: string;
  /** Anything thrown; turned into a readable message. */
  error?: unknown;
  /** Shows an "Opnieuw proberen" button. */
  onRetry?: () => void;
  className?: string;
}

/** Friendly error block with an optional retry. */
export function ErrorState({
  title = "Er ging iets mis",
  error,
  onRetry,
  className,
}: ErrorStateProps) {
  const message = getErrorMessage(
    error,
    "Dit onderdeel kon niet worden geladen. Probeer het zo nog eens.",
  );

  return (
    <div
      role="alert"
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-destructive/20 bg-destructive/[0.04] px-6 py-10 text-center",
        className,
      )}
    >
      <span className="grid size-11 place-items-center rounded-full bg-destructive/10 text-destructive">
        <CircleAlert className="size-5" aria-hidden="true" />
      </span>
      <div className="flex max-w-md flex-col gap-1">
        <h3 className="font-semibold text-foreground">{title}</h3>
        <p className="text-sm text-muted-foreground">{message}</p>
      </div>
      {onRetry ? (
        <Button variant="outline" size="sm" onClick={onRetry} className="mt-1">
          <RotateCcw aria-hidden="true" />
          Opnieuw proberen
        </Button>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* EmptyBlock                                                          */
/* ------------------------------------------------------------------ */

export interface EmptyBlockProps {
  /** Lucide icon component (e.g. `Users`) or a rendered element. */
  icon?: LucideIcon | ReactNode;
  title: string;
  description?: ReactNode;
  /** Usually a <Button>. */
  action?: ReactNode;
  className?: string;
}

/** Empty list / nothing-here-yet block. */
export function EmptyBlock({
  icon = Inbox,
  title,
  description,
  action,
  className,
}: EmptyBlockProps) {
  let iconNode: ReactNode = null;
  if (isValidElement(icon)) {
    iconNode = icon;
  } else if (icon) {
    const Icon = icon as LucideIcon;
    iconNode = <Icon className="size-5" aria-hidden="true" />;
  }

  return (
    <div
      className={cn(
        "flex flex-col items-center gap-3 rounded-xl border border-dashed bg-card/50 px-6 py-12 text-center",
        className,
      )}
    >
      {iconNode ? (
        <span className="grid size-12 place-items-center rounded-2xl bg-primary/10 text-primary ring-1 ring-primary/15 [&>svg]:size-5">
          {iconNode}
        </span>
      ) : null}
      <div className="flex max-w-sm flex-col gap-1">
        <h3 className="font-semibold text-foreground">{title}</h3>
        {description ? (
          <p className="text-sm text-balance text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      {action ? (
        <div className="mt-2 flex flex-wrap justify-center gap-2">{action}</div>
      ) : null}
    </div>
  );
}
