"use client";

/**
 * Client-side tRPC (TanStack React Query integration).
 *
 * Usage in client components:
 *   const trpc = useTRPC();
 *   const { data } = useQuery(trpc.class.list.queryOptions());
 *   const create = useMutation(trpc.class.create.mutationOptions({ onSuccess }));
 *   const queryClient = useQueryClient();
 *   await queryClient.invalidateQueries({ queryKey: trpc.class.list.queryKey() });
 */
import { type QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createTRPCClient,
  httpBatchStreamLink,
  loggerLink,
} from "@trpc/client";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";
import { createTRPCContext } from "@trpc/tanstack-react-query";
import { useState } from "react";
import superjson from "superjson";
import { z } from "zod";
import type { AppRouter } from "@/server/api/root";
import { makeQueryClient } from "./query-client";

// The production CSP has no 'unsafe-eval'. zod's JIT probes `new Function`
// and the browser reports that probe as a CSP violation even though zod
// falls back silently, so switch the JIT off in the browser. (Best effort:
// schemas built before this module runs have already probed; see the
// integration notes about src/instrumentation-client.ts.)
if (typeof window !== "undefined") z.config({ jitless: true });

export const { TRPCProvider, useTRPC, useTRPCClient } =
  createTRPCContext<AppRouter>();

/** e.g. `RouterOutputs["class"]["list"][number]` */
export type RouterInputs = inferRouterInputs<AppRouter>;
export type RouterOutputs = inferRouterOutputs<AppRouter>;

let browserQueryClient: QueryClient | undefined;
function getQueryClient() {
  if (typeof window === "undefined") return makeQueryClient();
  browserQueryClient ??= makeQueryClient();
  return browserQueryClient;
}

function getBaseUrl() {
  if (typeof window !== "undefined") return window.location.origin;
  return (
    process.env.BETTER_AUTH_URL ??
    `http://localhost:${process.env.PORT ?? 3000}`
  );
}

export function TRPCReactProvider({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  const [trpcClient] = useState(() =>
    createTRPCClient<AppRouter>({
      links: [
        loggerLink({
          enabled: (op) =>
            process.env.NODE_ENV === "development" ||
            (op.direction === "down" && op.result instanceof Error),
        }),
        httpBatchStreamLink({
          transformer: superjson,
          url: `${getBaseUrl()}/api/trpc`,
          // Same cap as the server's maxBatchSize; long GET batches split.
          maxItems: 20,
          maxURLLength: 2000,
          headers: () => {
            const headers = new Headers();
            headers.set("x-trpc-source", "nextjs-react");
            return headers;
          },
        }),
      ],
    }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
        {children}
      </TRPCProvider>
    </QueryClientProvider>
  );
}
