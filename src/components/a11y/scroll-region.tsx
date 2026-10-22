import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export interface ScrollRegionProps {
  /** Accessible name, e.g. the table caption ("Resultaten per leerling"). */
  label: string;
  className?: string;
  children: ReactNode;
}

/**
 * A scrollable area that keyboard users can reach and scroll with the arrow
 * keys (axe `scrollable-region-focusable`, WCAG 2.1.1). Use it around wide
 * tables and code that may overflow.
 */
export function ScrollRegion({
  label,
  className,
  children,
}: ScrollRegionProps) {
  return (
    <section
      aria-label={label}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: a scrollable region must be focusable for keyboard scrolling
      tabIndex={0}
      className={cn(
        "overflow-auto rounded-[inherit] outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      {children}
    </section>
  );
}
