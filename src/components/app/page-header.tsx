import { ChevronLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface PageHeaderProps {
  title: ReactNode;
  description?: ReactNode;
  /** Buttons on the right (wrap below the title on phones). */
  actions?: ReactNode;
  /** Shows a small "back" link above the title. */
  backHref?: string;
  /** Label for the back link. Default "Terug". */
  backLabel?: string;
  /** Rendered next to the title, e.g. a <StatusBadge />. */
  badge?: ReactNode;
  className?: string;
}

/** Title block at the top of every app page. */
export function PageHeader({
  title,
  description,
  actions,
  backHref,
  backLabel = "Terug",
  badge,
  className,
}: PageHeaderProps) {
  return (
    <header className={cn("flex flex-col gap-3 pb-2", className)}>
      {backHref ? (
        <Link
          href={backHref}
          className="-ml-1 inline-flex w-fit items-center gap-1 rounded-md px-1 py-0.5 text-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
        >
          <ChevronLeft className="size-4" aria-hidden="true" />
          {backLabel}
        </Link>
      ) : null}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1.5">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <h1 className="font-display text-2xl leading-tight font-bold tracking-tight text-balance text-foreground sm:text-[1.75rem]">
              {title}
            </h1>
            {badge ? <div className="flex items-center gap-2">{badge}</div> : null}
          </div>
          {description ? (
            <div className="max-w-2xl text-sm text-pretty text-muted-foreground sm:text-[0.95rem]">
              {description}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>
        ) : null}
      </div>
    </header>
  );
}
