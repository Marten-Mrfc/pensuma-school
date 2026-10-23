import type { LucideIcon } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export type StatTone =
  | "default"
  | "primary"
  | "success"
  | "warning"
  | "destructive"
  | "info";

/** Only tones that mean "needs attention" or "failed" colour the hint. */
const TONE_HINT: Partial<Record<StatTone, string>> = {
  warning: "font-medium text-warning-ink",
  destructive: "font-medium text-destructive-ink",
};

export interface StatCardProps {
  label: ReactNode;
  value: ReactNode;
  /** @deprecated ignored; remove at call sites */
  icon?: LucideIcon | ReactNode;
  /** Small line under the value, e.g. "3 deze week". */
  hint?: ReactNode;
  /** `warning` and `destructive` colour the hint; every other tone is neutral. */
  tone?: StatTone;
  className?: string;
}

/** A single number with its label and a short hint, for summary rows. */
export function StatCard({
  label,
  value,
  hint,
  tone = "default",
  className,
}: StatCardProps) {
  return (
    <div
      className={cn(
        "flex flex-col gap-1 rounded-xl border bg-card px-4 py-3.5 text-card-foreground",
        className,
      )}
    >
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="font-display text-3xl leading-none font-bold tracking-tight tabular-nums">
        {value}
      </div>
      {hint ? (
        <div className={cn("text-xs text-muted-foreground", TONE_HINT[tone])}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}
