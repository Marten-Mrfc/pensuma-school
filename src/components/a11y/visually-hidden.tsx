import type { ReactNode } from "react";

export interface VisuallyHiddenProps {
  /** Default `span`; use `div` for block content. */
  as?: "span" | "div";
  id?: string;
  children: ReactNode;
}

/** Text for screen readers only (Tailwind `sr-only`). */
export function VisuallyHidden({
  as: Tag = "span",
  id,
  children,
}: VisuallyHiddenProps) {
  return (
    <Tag id={id} className="sr-only">
      {children}
    </Tag>
  );
}
