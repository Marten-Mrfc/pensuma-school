import { type ExternalToast, toast } from 'sonner'

/** How long an error toast stays visible: long enough to read it (WCAG 2.2.1). */
export const ERROR_TOAST_DURATION = 10_000

/** Options for an error toast: 10 seconds unless the caller asks otherwise. */
export function errorToastOptions(opts?: ExternalToast): ExternalToast {
  return { duration: ERROR_TOAST_DURATION, ...opts }
}

/**
 * Error toast that stays 10 seconds instead of the default 4 (it also has the
 * Toaster's close button, so it can be dismissed earlier).
 */
export function toastError(message: Parameters<typeof toast.error>[0], opts?: ExternalToast) {
  return toast.error(message, errorToastOptions(opts))
}
