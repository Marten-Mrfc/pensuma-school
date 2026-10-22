import Link from "next/link";
import { cn } from "@/lib/utils";

type LogoSize = "sm" | "md" | "lg";

const MARK_SIZE: Record<LogoSize, string> = {
  sm: "size-7",
  md: "size-8",
  lg: "size-11",
};

const WORDMARK_SIZE: Record<LogoSize, string> = {
  sm: "text-[1.05rem]",
  md: "text-[1.2rem]",
  lg: "text-[1.6rem]",
};

export interface LogoMarkProps {
  className?: string;
  /** Accessible label. Omit when the mark sits next to the visible wordmark. */
  title?: string;
}

/**
 * The Pensuma mark: a "P" whose bowl is a prompt chevron, followed by a
 * blinking-cursor underscore — "P>_". It reads as a terminal prompt that is
 * waiting for (and accepting) your input.
 */
export function LogoMark({ className, title }: LogoMarkProps) {
  return (
    <svg
      viewBox="0 0 32 32"
      className={cn("shrink-0", className)}
      role={title ? "img" : undefined}
      aria-hidden={title ? undefined : true}
      aria-label={title}
    >
      <rect width="32" height="32" rx="9" className="fill-primary" />
      <path
        d="M17.5 23.5H23"
        className="stroke-primary-foreground/60"
        strokeWidth="2.6"
        strokeLinecap="round"
        fill="none"
      />
      <path
        d="M10.5 24V8.5L20 13.25L10.5 18"
        className="stroke-primary-foreground"
        strokeWidth="2.8"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

export interface LogoProps {
  className?: string;
  size?: LogoSize;
  /** Show the "Pensuma" wordmark next to the mark. Default true. */
  showWordmark?: boolean;
  /** Wrap in a link. Pass `null` for a static logo (e.g. during an exam). */
  href?: string | null;
}

/** Brand lockup: mark + "Pensuma" wordmark in the Anybody display face. */
export function Logo({
  className,
  size = "md",
  showWordmark = true,
  href = "/",
}: LogoProps) {
  const content = (
    <>
      <LogoMark
        className={MARK_SIZE[size]}
        title={showWordmark ? undefined : "Pensuma"}
      />
      {showWordmark ? (
        <span
          className={cn(
            "font-display-wide leading-none font-bold tracking-tight text-foreground",
            WORDMARK_SIZE[size],
          )}
        >
          Pensuma
        </span>
      ) : null}
    </>
  );

  const classes = cn(
    "inline-flex items-center gap-2.5 rounded-md outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
    className,
  );

  if (href === null) {
    return <span className={classes}>{content}</span>;
  }

  return (
    <Link href={href} className={classes} aria-label="Pensuma, naar de startpagina">
      {content}
    </Link>
  );
}
