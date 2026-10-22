import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Validates a redirect target to protect against open-redirect attacks.
 * Rejects external URLs, protocol-relative URLs and backslash bypasses.
 */
export function safeRedirectPath(
  value: string | null | undefined,
  fallback = "/",
): string {
  const candidate = value?.trim();
  if (!candidate) return fallback;
  if (
    !candidate.startsWith("/") ||
    candidate.startsWith("//") ||
    candidate.includes("\\")
  )
    return fallback;
  try {
    const url = new URL(candidate, "https://pensuma.local");
    if (url.origin !== "https://pensuma.local") return fallback;
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return fallback;
  }
}
