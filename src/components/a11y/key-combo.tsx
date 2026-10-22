import { Fragment } from "react";
import { cn } from "@/lib/utils";

const KEY_CLASS =
  "inline-flex h-6 min-w-6 items-center justify-center rounded border border-b-2 bg-muted px-1.5 font-mono text-xs font-medium text-foreground";

/**
 * Renders a shortcut string from SHORTCUTS ("Tab / Shift+Tab",
 * "Esc, daarna Tab", "Alt+← / Alt+→") as <kbd> keys. The text stays
 * readable for screen readers: "Shift+Tab" is read as written.
 */
export function KeyCombo({
  keys,
  className,
}: {
  keys: string;
  className?: string;
}) {
  const alternatives = keys.split(" / ");
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1", className)}>
      {alternatives.map((alternative, a) => (
        <Fragment key={alternative}>
          {a > 0 ? <span className="text-muted-foreground">/</span> : null}
          {alternative.split(", daarna ").map((step, s) => (
            <Fragment key={step}>
              {s > 0 ? (
                <span className="text-xs text-muted-foreground">daarna</span>
              ) : null}
              <kbd className="inline-flex items-center gap-0.5">
                {step.split("+").map((part, p) => (
                  <Fragment key={part}>
                    {p > 0 ? (
                      <span className="text-xs text-muted-foreground">+</span>
                    ) : null}
                    <kbd className={KEY_CLASS}>{part}</kbd>
                  </Fragment>
                ))}
              </kbd>
            </Fragment>
          ))}
        </Fragment>
      ))}
    </span>
  );
}
