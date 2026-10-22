/**
 * Turns anything thrown (tRPC client errors, better-auth errors, plain Error,
 * strings) into one readable Dutch sentence for toasts and error states.
 *
 *   toast.error(getErrorMessage(error));
 */
export function getErrorMessage(
  error: unknown,
  fallback = "Er ging iets mis. Probeer het opnieuw.",
): string {
  if (!error) return fallback;
  if (typeof error === "string") return error.trim() || fallback;

  if (typeof error === "object") {
    const e = error as {
      message?: unknown;
      data?: {
        code?: string;
        zodError?: {
          formErrors?: string[];
          fieldErrors?: Record<string, string[] | undefined>;
        } | null;
      };
    };

    // tRPC input validation: show the first zod message, not the JSON blob.
    const zod = e.data?.zodError;
    if (zod) {
      const first =
        zod.formErrors?.[0] ??
        Object.values(zod.fieldErrors ?? {}).find((m) => m?.length)?.[0];
      if (first) return first;
    }

    const message = typeof e.message === "string" ? e.message.trim() : "";
    if (message.startsWith("[")) {
      try {
        const issues = JSON.parse(message) as { message?: string }[];
        if (issues[0]?.message) return issues[0].message;
      } catch {
        // fall through
      }
    }

    if (/failed to fetch|networkerror|load failed/i.test(message)) {
      return "Kan de server niet bereiken. Controleer je internetverbinding.";
    }

    switch (e.data?.code) {
      case "UNAUTHORIZED":
        return message || "Je bent niet (meer) ingelogd.";
      case "FORBIDDEN":
        return message || "Je hebt hier geen toegang toe.";
      case "NOT_FOUND":
        return message || "Dit bestaat niet (meer).";
      case "INTERNAL_SERVER_ERROR":
        return fallback;
    }

    if (message) return message;
  }

  return fallback;
}
