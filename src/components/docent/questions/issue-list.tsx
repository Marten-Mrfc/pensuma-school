import { CircleAlert, TriangleAlert } from "lucide-react";
import {
  capitalize,
  type IssueSeverity,
  type QuestionIssue,
} from "@/lib/questions/validate";
import { cn } from "@/lib/utils";

/**
 * Small marker for one severity. Errors (they block publishing) and
 * warnings differ in shape, not only in colour (WCAG 1.4.1): a circle
 * with "!" versus a triangle, drawn in the "-ink" tones that keep
 * 3:1 contrast on cards, hover and selected backgrounds (WCAG 1.4.11).
 * The same icon pair as IssueList.
 */
export function IssueIcon({
  severity,
  label,
  className,
}: {
  severity: IssueSeverity;
  /** Accessible name, e.g. "2 problemen". */
  label: string;
  className?: string;
}) {
  const Icon = severity === "error" ? CircleAlert : TriangleAlert;
  return (
    <span
      role="img"
      aria-label={label}
      data-severity={severity}
      className={cn("inline-flex shrink-0", className)}
    >
      <Icon
        className={cn(
          "size-3.5",
          severity === "error" ? "text-destructive-ink" : "text-warning-ink",
        )}
        strokeWidth={2.5}
        aria-hidden="true"
      />
    </span>
  );
}

/** Marker for a list item with issues: the worst severity, with a count. */
export function IssueDot({
  issues,
  className,
}: {
  issues: readonly QuestionIssue[];
  className?: string;
}) {
  const severity = worstSeverity(issues);
  if (!severity) return null;
  return (
    <IssueIcon
      severity={severity}
      label={issueCountLabel(issues)}
      className={className}
    />
  );
}

/** "1 probleem", "3 problemen", "2 aandachtspunten". */
export function issueCountLabel(issues: readonly QuestionIssue[]): string {
  const count = issues.length;
  if (worstSeverity(issues) === "error") {
    return `${count} ${count === 1 ? "probleem" : "problemen"}`;
  }
  return `${count} ${count === 1 ? "aandachtspunt" : "aandachtspunten"}`;
}

export function worstSeverity(
  issues: readonly QuestionIssue[],
): IssueSeverity | null {
  if (issues.some((i) => i.severity === "error")) return "error";
  if (issues.length > 0) return "warning";
  return null;
}

/** Compact list of issues (errors first). */
export function IssueList({
  issues,
  className,
  compact,
}: {
  issues: readonly QuestionIssue[];
  className?: string;
  compact?: boolean;
}) {
  if (issues.length === 0) return null;
  return (
    <ul className={cn("flex flex-col gap-1.5", className)}>
      {issues.map((issue) => {
        const isError = issue.severity === "error";
        const Icon = isError ? CircleAlert : TriangleAlert;
        return (
          <li
            key={`${issue.code}-${issue.message}`}
            className={cn(
              "flex items-start gap-2 rounded-md text-[0.8rem] leading-snug",
              compact ? "" : "px-2.5 py-1.5",
              !compact && (isError ? "bg-destructive/[0.07]" : "bg-warning/10"),
              isError ? "text-destructive-ink" : "text-warning-ink",
            )}
          >
            <Icon className="mt-px size-3.5 shrink-0" aria-hidden="true" />
            <span className="min-w-0">{capitalize(issue.message)}</span>
          </li>
        );
      })}
    </ul>
  );
}
