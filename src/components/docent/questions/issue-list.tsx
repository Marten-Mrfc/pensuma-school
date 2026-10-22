import { CircleAlert, TriangleAlert } from "lucide-react";
import {
  capitalize,
  type IssueSeverity,
  type QuestionIssue,
} from "@/lib/questions/validate";
import { cn } from "@/lib/utils";

/** Coloured dot for a list item: red for errors, amber for warnings. */
export function IssueDot({
  issues,
  className,
}: {
  issues: readonly QuestionIssue[];
  className?: string;
}) {
  const severity = worstSeverity(issues);
  if (!severity) return null;
  const count = issues.length;
  return (
    <span
      role="img"
      aria-label={`${count} ${severity === "error" ? "probleem" : "aandachtspunt"}${count === 1 ? "" : "en"}`}
      className={cn(
        "inline-block size-2 shrink-0 rounded-full ring-2 ring-card",
        severity === "error" ? "bg-destructive" : "bg-warning",
        className,
      )}
    />
  );
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
