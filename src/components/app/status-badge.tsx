import { cn } from "@/lib/utils";

export type StatusKind =
  | "test"
  | "assignment"
  | "attempt"
  | "answer"
  | "grading";

type Tone =
  | "neutral"
  | "muted"
  | "success"
  | "warning"
  | "info"
  | "destructive";

const STATUS_MAP: Record<
  StatusKind,
  Record<string, { label: string; tone: Tone; pulse?: boolean }>
> = {
  test: {
    draft: { label: "Concept", tone: "neutral" },
    published: { label: "Gepubliceerd", tone: "success" },
    archived: { label: "Gearchiveerd", tone: "muted" },
  },
  assignment: {
    planned: { label: "Gepland", tone: "info" },
    open: { label: "Open", tone: "success", pulse: true },
    closed: { label: "Gesloten", tone: "muted" },
  },
  attempt: {
    in_progress: { label: "Bezig", tone: "warning", pulse: true },
    submitted: { label: "Ingeleverd", tone: "success" },
  },
  grading: {
    pending: { label: "Wordt nagekeken", tone: "info", pulse: true },
    graded: { label: "Nagekeken", tone: "success" },
    needs_review: { label: "Nakijken nodig", tone: "warning" },
  },
  answer: {
    empty: { label: "Niet beantwoord", tone: "muted" },
    saved: { label: "Opgeslagen", tone: "info" },
    graded: { label: "Nagekeken", tone: "success" },
    needs_review: { label: "Nakijken nodig", tone: "warning" },
  },
};

const TONE_CLASS: Record<Tone, string> = {
  neutral: "bg-secondary text-secondary-foreground",
  muted: "bg-muted text-muted-foreground",
  success: "bg-success/12 text-success-ink",
  warning: "bg-warning/15 text-warning-ink",
  info: "bg-info/12 text-info-ink",
  destructive: "bg-destructive/10 text-destructive-ink",
};

const DOT_CLASS: Record<Tone, string> = {
  neutral: "bg-muted-foreground/60",
  muted: "bg-muted-foreground/40",
  success: "bg-success",
  warning: "bg-warning",
  info: "bg-info",
  destructive: "bg-destructive",
};

/** Dutch label for a status, e.g. `statusLabel("test", "draft") === "Concept"`. */
export function statusLabel(kind: StatusKind, status: string): string {
  return STATUS_MAP[kind]?.[status]?.label ?? status;
}

export interface StatusBadgeProps {
  kind: StatusKind;
  status: string;
  className?: string;
}

/**
 * Small tag with a Dutch label for test / assignment / attempt / answer /
 * grading statuses. Only live states (open, bezig, wordt nagekeken) get a dot.
 */
export function StatusBadge({ kind, status, className }: StatusBadgeProps) {
  const entry = STATUS_MAP[kind]?.[status] ?? {
    label: status,
    tone: "neutral" as Tone,
  };

  return (
    <span
      data-status={status}
      className={cn(
        "inline-flex h-6 w-fit shrink-0 items-center gap-1.5 rounded-sm px-2 text-xs font-medium whitespace-nowrap",
        TONE_CLASS[entry.tone],
        className,
      )}
    >
      {entry.pulse ? (
        <span className="relative flex size-1.5" aria-hidden="true">
          <span
            className={cn(
              // Stops after 3 pulses (WCAG 2.2.2: no endless motion).
              "absolute inline-flex size-full rounded-full opacity-60 motion-safe:animate-ping motion-safe:[animation-iteration-count:3]",
              DOT_CLASS[entry.tone],
            )}
          />
          <span
            className={cn(
              "relative inline-flex size-1.5 rounded-full",
              DOT_CLASS[entry.tone],
            )}
          />
        </span>
      ) : null}
      {entry.label}
    </span>
  );
}
