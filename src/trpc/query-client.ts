import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from "@tanstack/react-query";
import superjson from "superjson";

/** Errors a retry cannot fix (and rate limits a retry would worsen). */
const NO_RETRY_CODES = new Set([
  "TOO_MANY_REQUESTS",
  "FORBIDDEN",
  "UNAUTHORIZED",
  "NOT_FOUND",
  "BAD_REQUEST",
]);

export function shouldRetryQuery(failureCount: number, error: unknown) {
  const code = (error as { data?: { code?: string } } | null)?.data?.code;
  if (code && NO_RETRY_CODES.has(code)) return false;
  return failureCount < 2;
}

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Avoid refetching immediately on the client after SSR hydration.
        staleTime: 30 * 1000,
        retry: shouldRetryQuery,
      },
      dehydrate: {
        serializeData: superjson.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) ||
          query.state.status === "pending",
      },
      hydrate: {
        deserializeData: superjson.deserialize,
      },
    },
  });
}
