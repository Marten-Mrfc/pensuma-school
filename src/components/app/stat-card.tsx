import type { LucideIcon } from "lucide-react";
import { isValidElement, type ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatTone =
  | "default"
  | "primary"
  | "success"
  | "warning"
  | "destructive"
  | "info";

const TONE_ICON: Record<StatTone, string> = {
  default: "bg-muted text-muted-foreground",
  primary: "bg-primary/10 text-primary",
  success: "bg-success/12 text-success-ink",
  warning: "bg-warning/15 text-warning-ink",
  destructive: "bg-destructive/10 text-destructive-ink",
  info: "bg-info/10 text-info-ink",
};

const TONE_BAR: Record<StatTone, string> = {
  default: "bg-border",
  primary: "bg-primary",
  success: "bg-success",
  warning: "bg-warning",
  destructive: "bg-destructive",
  info: "bg-info",
};

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  /** Lucide icon component (e.g. `Users`) or a rendered element. */
  icon?: LucideIcon | ReactNode;
  /** Small line under the value, e.g. "3 deze week". */
  hint?: ReactNode;
  tone?: StatTone;
  className?: string;
}

/** A single KPI tile for dashboards. */
export function StatCard({
  label,
  value,
  icon,
  hint,
  tone = "default",
  className,
}: StatCardProps) {
  let iconNode: ReactNode = null;
  if (isValidElement(icon)) {
    iconNode = icon;
  } else if (icon) {
    const Icon = icon as LucideIcon;
    iconNode = <Icon className="size-[18px]" aria-hidden="true" />;
  }

  return (
    <div
      className={cn(
        "relative flex flex-col gap-3 overflow-hidden rounded-xl border bg-card p-5 text-card-foreground shadow-xs",
        className,
      )}
    >
      <span
        aria-hidden="true"
        className={cn("absolute inset-y-0 left-0 w-[3px]", TONE_BAR[tone])}
      />
      <div className="flex items-start justify-between gap-3">
        <span className="text-sm font-medium text-muted-foreground">{label}</span>
        {iconNode ? (
          <span
            className={cn(
              "grid size-9 shrink-0 place-items-center rounded-lg [&>svg]:size-[18px]",
              TONE_ICON[tone],
            )}
          >
            {iconNode}
          </span>
        ) : null}
      </div>
      <div className="font-display text-3xl leading-none font-bold tracking-tight tabular-nums">
        {value}
      </div>
      {hint ? <div className="text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}
