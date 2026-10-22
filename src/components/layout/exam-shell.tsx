import type { ReactNode } from "react";
import { LogoMark } from "@/components/app/logo";
import { cn } from "@/lib/utils";

export interface ExamShellProps {
  /** Test title, shown in the slim header. */
  title: ReactNode;
  /** Small line under the title, e.g. "Vraag 3 van 8" or the class name. */
  subtitle?: ReactNode;
  /** Usually a <CountdownTimer />. */
  timer?: ReactNode;
  /** Right-aligned header actions, e.g. the "Inleveren" button. */
  actions?: ReactNode;
  /** Optional sticky bottom bar (question navigation). */
  footer?: ReactNode;
  /**
   * `scroll` (default): the body scrolls as one page.
   * `fixed`: the body fills the viewport and children manage their own
   * scrolling (for split code/question panes).
   */
  bodyMode?: "scroll" | "fixed";
  className?: string;
  children: ReactNode;
}

/**
 * Distraction-free exam frame: no navigation links, just the test title,
 * timer and actions. Use it inside /leerling/poging/[pogingId].
 */
export function ExamShell({
  title,
  subtitle,
  timer,
  actions,
  footer,
  bodyMode = "scroll",
  className,
  children,
}: ExamShellProps) {
  return (
    <div className={cn("flex h-dvh flex-col bg-background", className)}>
      <header className="z-30 flex h-14 shrink-0 items-center gap-3 border-b bg-card/85 px-3 backdrop-blur-md sm:h-16 sm:px-5">
        <LogoMark className="size-7 sm:size-8" />
        <div className="flex min-w-0 flex-col">
          <h1 className="truncate text-sm leading-tight font-semibold sm:text-base">
            {title}
          </h1>
          {subtitle ? (
            <p className="truncate text-xs leading-tight text-muted-foreground">
              {subtitle}
            </p>
          ) : null}
        </div>
        <div className="ml-auto flex shrink-0 items-center gap-2">
          {timer}
          {actions}
        </div>
      </header>
      <div
        id="inhoud"
        className={cn(
          "min-h-0 flex-1",
          bodyMode === "scroll" ? "overflow-y-auto" : "overflow-hidden",
        )}
      >
        {children}
      </div>
      {footer ? (
        <div className="shrink-0 border-t bg-card/85 backdrop-blur-md">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
