"use client";

import {
  AlertTriangle,
  CheckCircle2,
  Info,
  type LucideIcon,
  OctagonAlert,
} from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

type Tone = "info" | "warning" | "success" | "destructive";

const TONES: Record<Tone, { box: string; icon: string; Icon: LucideIcon }> = {
  info: {
    box: "border-info/25 bg-info/[0.06]",
    icon: "text-info-ink",
    Icon: Info,
  },
  warning: {
    box: "border-warning/35 bg-warning/[0.08]",
    icon: "text-warning-ink",
    Icon: AlertTriangle,
  },
  success: {
    box: "border-success/25 bg-success/[0.06]",
    icon: "text-success-ink",
    Icon: CheckCircle2,
  },
  destructive: {
    box: "border-destructive/25 bg-destructive/[0.06]",
    icon: "text-destructive-ink",
    Icon: OctagonAlert,
  },
};

/**
 * A static inline notice (not a live region): role="note", an icon plus text,
 * so the meaning never depends on colour alone.
 */
export function Notice({
  tone = "info",
  title,
  icon,
  className,
  children,
}: {
  tone?: Tone;
  title?: ReactNode;
  icon?: LucideIcon;
  className?: string;
  children?: ReactNode;
}) {
  const t = TONES[tone];
  const Icon = icon ?? t.Icon;
  return (
    <div
      role="note"
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3.5 text-sm leading-relaxed",
        t.box,
        className,
      )}
    >
      <Icon
        className={cn("mt-0.5 size-4 shrink-0", t.icon)}
        aria-hidden="true"
      />
      <div className="flex min-w-0 flex-col gap-1">
        {title ? <p className="font-medium text-foreground">{title}</p> : null}
        {children ? <div className="text-foreground/90">{children}</div> : null}
      </div>
    </div>
  );
}
