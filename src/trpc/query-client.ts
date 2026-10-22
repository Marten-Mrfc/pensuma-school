import {
  defaultShouldDehydrateQuery,
  QueryClient,
} from "@tanstack/react-query";
import superjson from "superjson";

export function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Avoid refetching immediately on the client after SSR hydration.
        staleTime: 30 * 1000,
        retry: (count, error) => {
          const code = (error as { data?: { code?: string } })?.data?.code;
          if (code === "UNAUTHORIZED" || code === "FORBIDDEN" || code === "NOT_FOUND") return false;
          return count < 2;
        },
      },
      dehydrate: {
        serializeData: superjson.serialize,
        shouldDehydrateQuery: (query) =>
          defaultShouldDehydrateQuery(query) || query.state.status === "pending",
      },
      hydrate: {
        deserializeData: superjson.deserialize,
      },
    },
  });
}
