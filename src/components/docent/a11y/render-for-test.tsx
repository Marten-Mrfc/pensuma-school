/**
 * Test helper (only imported by *.test.tsx): renders a teacher component to
 * static markup inside the tRPC + React Query providers, with query data
 * seeded up front. Nothing is fetched: on the server, useQuery only reads
 * the cache. A stub app router and the given search params stand in for
 * Next's navigation contexts (useRouter, useSearchParams).
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import {
  AppRouterContext,
  type AppRouterInstance,
} from "next/dist/shared/lib/app-router-context.shared-runtime";
import { SearchParamsContext } from "next/dist/shared/lib/hooks-client-context.shared-runtime";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import superjson from "superjson";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AppRouter } from "@/server/api/root";
import { TRPCProvider } from "@/trpc/react";

const noop = () => {};
const stubRouter = {
  back: noop,
  forward: noop,
  refresh: noop,
  push: noop,
  replace: noop,
  prefetch: noop,
} as unknown as AppRouterInstance;

export function createRenderer({ search = "" }: { search?: string } = {}) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const trpcClient = createTRPCClient<AppRouter>({
    links: [
      httpLink({ url: "http://127.0.0.1:9/api/trpc", transformer: superjson }),
    ],
  });
  const trpc = createTRPCOptionsProxy<AppRouter>({
    client: trpcClient,
    queryClient,
  });
  const searchParams = new URLSearchParams(search);
  const render = (node: ReactNode) =>
    renderToStaticMarkup(
      <AppRouterContext value={stubRouter}>
        <SearchParamsContext value={searchParams}>
          <QueryClientProvider client={queryClient}>
            <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
              <TooltipProvider>{node}</TooltipProvider>
            </TRPCProvider>
          </QueryClientProvider>
        </SearchParamsContext>
      </AppRouterContext>,
    );
  return { queryClient, trpc, render };
}

/** A promise React's `use()` reads synchronously (already fulfilled). */
export function fulfilled<T>(value: T): Promise<T> {
  const promise = Promise.resolve(value) as Promise<T> & {
    status: "fulfilled";
    value: T;
  };
  promise.status = "fulfilled";
  promise.value = value;
  return promise;
}

/** The opening tags of every element whose attributes match `pattern`. */
export function tagsMatching(html: string, pattern: RegExp): string[] {
  return (html.match(/<[a-z][^>]*>/g) ?? []).filter((tag) => pattern.test(tag));
}

/** Visible text: tags removed, common entities decoded. */
export function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
