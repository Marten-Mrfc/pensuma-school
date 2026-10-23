import { toast } from "sonner";
import type { ToastCopy } from "./copy";

/**
 * Show a toast from copy.ts. A warning (e.g. students skipped because their
 * processing is restricted) stays longer, so the teacher can read it.
 */
export function showToast({ tone, title, description }: ToastCopy) {
  toast[tone](title, {
    description,
    ...(tone === "warning" ? { duration: 15_000 } : {}),
  });
}
