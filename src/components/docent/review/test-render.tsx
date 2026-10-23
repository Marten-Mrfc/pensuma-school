/**
 * Test helper (only imported by *.test.tsx): renders a client component to
 * static markup inside the tRPC + React Query providers, with query data
 * seeded up front. Nothing is fetched: on the server, useQuery only reads
 * the cache.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createTRPCClient, httpLink } from "@trpc/client";
import { createTRPCOptionsProxy } from "@trpc/tanstack-react-query";
import type { ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import superjson from "superjson";
import { CurrentUserProvider } from "@/components/app/current-user";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { AppRouter } from "@/server/api/root";
import { TRPCProvider } from "@/trpc/react";

export const TEST_TEACHER = {
  id: "teacher-1",
  name: "Mila de Docent",
  email: "docent@pensuma.local",
  role: "admin",
  username: null,
} as const;

export function createTestTrpc() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: Infinity } },
  });
  const trpcClient = createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: "http://127.0.0.1:9/api/trpc",
        transformer: superjson,
      }),
    ],
  });
  const trpc = createTRPCOptionsProxy<AppRouter>({
    client: trpcClient,
    queryClient,
  });
  const render = (node: ReactNode) =>
    renderToStaticMarkup(
      <QueryClientProvider client={queryClient}>
        <TRPCProvider trpcClient={trpcClient} queryClient={queryClient}>
          <TooltipProvider>
            <CurrentUserProvider user={{ ...TEST_TEACHER }}>
              {node}
            </CurrentUserProvider>
          </TooltipProvider>
        </TRPCProvider>
      </QueryClientProvider>,
    );
  return { queryClient, trpc, render };
}

/** The opening tags of every element whose attributes match `pattern`. */
export function tagsMatching(html: string, pattern: RegExp): string[] {
  return (html.match(/<[a-z][^>]*>/g) ?? []).filter((tag) => pattern.test(tag));
}

/** Visible text: tags removed, entities for quotes/ampersands decoded. */
export function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}
