import { getErrorMessage } from "@/components/app/get-error-message";

/**
 * Callbacks for review.regradeAttempt ("Opnieuw nakijken" on one attempt).
 * The page is refreshed after an error too: a partial failure (BAD_GATEWAY
 * "Opnieuw nagekeken, maar …") means some answers did get a new score, and
 * the review must not keep showing the old ones.
 */
export function regradeAttemptCallbacks({
  refresh,
  onDone,
  onFailed,
}: {
  /** Invalidate the review and assignment queries. */
  refresh: () => Promise<unknown>;
  onDone: () => void;
  onFailed: (message: string) => void;
}) {
  return {
    onSuccess: async () => {
      await refresh();
      onDone();
    },
    onError: async (error: unknown) => {
      onFailed(getErrorMessage(error));
      await refresh();
    },
  };
}
