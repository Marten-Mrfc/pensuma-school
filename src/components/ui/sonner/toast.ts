import { type ExternalToast, toast } from 'sonner'

/** How long an error toast stays visible: long enough to read it (WCAG 2.2.1). */
export const ERROR_TOAST_DURATION = 10_000

/** Options for an error toast: 10 seconds unless the caller asks otherwise. */
export function errorToastOptions(opts?: ExternalToast): ExternalToast {
  return { ...opts, duration: opts?.duration ?? ERROR_TOAST_DURATION }
}

/**
 * Error toast that stays 10 seconds instead of the default 4 (it also has the
 * Toaster's close button, so it can be dismissed earlier).
 */
export function toastError(message: Parameters<typeof toast.error>[0], opts?: ExternalToast) {
  return toast.error(message, errorToastOptions(opts))
}

const DEFAULTS_INSTALLED = Symbol.for('pensuma.toast.error-defaults')

type ErrorFn = typeof toast.error & { [DEFAULTS_INSTALLED]?: true }

/**
 * Make every `toast.error(...)` stay 10 seconds unless the caller passes its
 * own `duration`. Sonner has one default duration for all toast types (4 s
 * here, fine for "Opgeslagen"), and most call sites use `toast.error` from
 * "sonner" directly, so a separate helper alone left their errors on screen
 * for only 4 seconds (WCAG 2.2.1 Timing Adjustable). Called once by the
 * Toaster module; safe to call again (hot reload).
 */
export function installErrorToastDefaults(target: { error: typeof toast.error } = toast): void {
  const current = target.error as ErrorFn
  if (current[DEFAULTS_INSTALLED]) return
  const withDefaults: ErrorFn = (message, data) => current(message, errorToastOptions(data))
  withDefaults[DEFAULTS_INSTALLED] = true
  target.error = withDefaults
}
