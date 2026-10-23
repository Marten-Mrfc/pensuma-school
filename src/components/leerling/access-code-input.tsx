"use client";

import type { Ref } from "react";
import { cn } from "@/lib/utils";

/**
 * Longest access code a teacher can set: "Zelf kiezen" allows 3–20 letters,
 * digits and dashes (ACCESS_CODE_REGEX in
 * src/components/docent/assignments/defaults.ts; a unit test keeps the two
 * in step). The field must take every code a teacher can choose, or the
 * code is cut off and always refused.
 */
export const ACCESS_CODE_MAX_LENGTH = 20;

/** What the student typed, the way the server compares it. */
export function normalizeTypedAccessCode(value: string): string {
  return value.toUpperCase().replace(/\s+/g, "");
}

/**
 * Smaller letters and spacing for longer codes, so a 20-character code
 * still fits on a phone (and in the 22rem side panel on a laptop).
 */
export function accessCodeSizeClass(length: number): string {
  if (length <= 8) return "text-3xl tracking-[0.35em]";
  if (length <= 12) return "text-2xl tracking-[0.2em]";
  return "text-lg tracking-[0.08em]";
}

/** The big "Toegangscode" field on the start screen. */
export function AccessCodeInput({
  id,
  value,
  onValueChange,
  invalid,
  describedBy,
  inputRef,
}: {
  id: string;
  value: string;
  onValueChange: (value: string) => void;
  invalid?: boolean;
  describedBy?: string;
  inputRef?: Ref<HTMLInputElement>;
}) {
  return (
    <input
      ref={inputRef}
      id={id}
      name="toegangscode"
      value={value}
      onChange={(e) => onValueChange(normalizeTypedAccessCode(e.target.value))}
      autoComplete="off"
      autoCorrect="off"
      autoCapitalize="characters"
      spellCheck={false}
      maxLength={ACCESS_CODE_MAX_LENGTH}
      placeholder="ABC123"
      aria-invalid={invalid ? true : undefined}
      aria-describedby={describedBy}
      className={cn(
        "h-16 w-full rounded-xl border-2 border-input bg-background px-4 text-center font-mono font-semibold uppercase shadow-xs transition-[border-color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring",
        accessCodeSizeClass(value.length),
        invalid &&
          "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/25",
      )}
    />
  );
}
