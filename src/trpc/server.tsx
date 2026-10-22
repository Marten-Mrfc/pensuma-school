import "server-only";

/**
 * Server-side tRPC helpers for Server Components.
 *
 * With `cacheComponents`, these read request headers, so components using
 * them must render inside <Suspense>. Prefer client-side `useTRPC()` hooks for
 * interactive pages; use these to prefetch and hydrate when it helps.
 *
 *   prefetch(trpc.class.list.queryOptions());
 *   return <HydrateClient><ClassList /></HydrateClient>;
 */
import { dehydrate, HydrationBoundary } from "@tanstack/react-query";
import {
  createTRPCOptionsProxy,
  type TRPCQueryOptions,
} from "@trpc/tanstack-react-query";
import { headers } from "next/headers";
import { cache } from "react";
import { appRouter, createCaller } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";
import { makeQueryClient } from "./query-client";

const createContext = cache(async () => {
  const heads = new Headers(await headers());
  heads.set("x-trpc-source", "rsc");
  return createTRPCContext({ headers: heads });
});

export const getQueryClient = cache(makeQueryClient);

export const trpc = createTRPCOptionsProxy({
  router: appRouter,
  ctx: createContext,
  queryClient: getQueryClient,
});

/** Direct server caller (no React Query cache). */
export const getCaller = cache(async () => createCaller(await createContext()));

export function HydrateClient({ children }: { children: React.ReactNode }) {
  const queryClient = getQueryClient();
  return (
    <HydrationBoundary state={dehydrate(queryClient)}>
      {children}
    </HydrationBoundary>
  );
}

// biome-ignore lint/suspicious/noExplicitAny: generic passthrough
export function prefetch<T extends ReturnType<TRPCQueryOptions<any>>>(
  queryOptions: T,
) {
  const queryClient = getQueryClient();
  if (queryOptions.queryKey[1]?.type === "infinite") {
    // biome-ignore lint/suspicious/noExplicitAny: infinite query passthrough
    void queryClient.prefetchInfiniteQuery(queryOptions as any);
  } else {
    void queryClient.prefetchQuery(queryOptions);
  }
}
