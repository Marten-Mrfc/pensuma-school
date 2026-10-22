import {
  CircleAlert,
  Info,
  type LucideIcon,
  TriangleAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const TONES = {
  info: {
    box: "border-info/25 bg-info/[0.06]",
    icon: "bg-info/12 text-info-ink",
    Icon: Info,
  },
  warning: {
    box: "border-warning/35 bg-warning/[0.08]",
    icon: "bg-warning/18 text-warning-ink",
    Icon: TriangleAlert,
  },
  destructive: {
    box: "border-destructive/25 bg-destructive/[0.05]",
    icon: "bg-destructive/10 text-destructive-ink",
    Icon: CircleAlert,
  },
} satisfies Record<string, { box: string; icon: string; Icon: LucideIcon }>;

export interface NoticeProps {
  tone?: keyof typeof TONES;
  title?: ReactNode;
  children?: ReactNode;
  /** Buttons/links under the text. */
  action?: ReactNode;
  icon?: LucideIcon;
  className?: string;
}

/** A calm, non-live note (role="note"): banners, warnings, explanations. */
export function Notice({
  tone = "info",
  title,
  children,
  action,
  icon,
  className,
}: NoticeProps) {
  const t = TONES[tone];
  const Icon = icon ?? t.Icon;
  return (
    <div
      role="note"
      className={cn(
        "flex gap-3.5 rounded-xl border px-4 py-3.5 text-sm sm:px-5 sm:py-4",
        t.box,
        className,
      )}
    >
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-lg",
          t.icon,
        )}
      >
        <Icon className="size-4" aria-hidden="true" />
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5 pt-1">
        {title ? (
          <p className="font-semibold text-foreground">{title}</p>
        ) : null}
        {children ? (
          <div className="leading-relaxed text-pretty text-muted-foreground">
            {children}
          </div>
        ) : null}
        {action ? (
          <div className="mt-1.5 flex flex-wrap gap-2">{action}</div>
        ) : null}
      </div>
    </div>
  );
}

/** Card with a heading, for the sections inside a tab. */
export function PanelCard({
  title,
  description,
  actions,
  children,
  className,
  headingLevel = 2,
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children?: ReactNode;
  className?: string;
  headingLevel?: 2 | 3;
}) {
  const Heading = headingLevel === 2 ? "h2" : "h3";
  return (
    <section
      className={cn(
        "flex flex-col gap-4 rounded-xl border bg-card p-4 shadow-xs sm:p-6",
        className,
      )}
    >
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 flex-col gap-1">
          <Heading className="font-display text-lg font-semibold tracking-tight text-foreground">
            {title}
          </Heading>
          {description ? (
            <div className="max-w-2xl text-sm text-pretty text-muted-foreground">
              {description}
            </div>
          ) : null}
        </div>
        {actions ? (
          <div className="flex shrink-0 flex-wrap gap-2">{actions}</div>
        ) : null}
      </div>
      {children}
    </section>
  );
}
