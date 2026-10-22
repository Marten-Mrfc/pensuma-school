import { fetchRequestHandler } from "@trpc/server/adapters/fetch";
import { env } from "@/env";
import { appRouter } from "@/server/api/root";
import { createTRPCContext } from "@/server/api/trpc";
import { errorIdFor } from "@/server/security/errors";
import {
  enforceBodyLimit,
  isCrossSiteMutation,
} from "@/server/security/request-guards";

/** test.importJson accepts 5 MB of JSON; nothing else comes close. */
const MAX_BODY_BYTES = 6 * 1024 * 1024;
/** Same limit as maxItems in the client's httpBatchStreamLink. */
const MAX_BATCH_SIZE = 20;

let appOrigin: string | undefined;
/** Lazy: env is only validated at runtime, not during `next build`. */
const getAppOrigin = () => {
  appOrigin ??= new URL(env.BETTER_AUTH_URL).origin;
  return appOrigin;
};

const json = (status: number, body: Record<string, string>) =>
  Response.json(body, {
    status,
    headers: { "cache-control": "no-store" },
  });

const handler = async (incoming: Request) => {
  if (
    isCrossSiteMutation(incoming, {
      appOrigin: getAppOrigin(),
      dev: env.NODE_ENV === "development",
    })
  ) {
    return json(403, { error: "Verzoek geweigerd." });
  }
  const limited = await enforceBodyLimit(incoming, MAX_BODY_BYTES);
  if (!limited.ok) return json(413, { error: "Dit verzoek is te groot." });
  const req = limited.request;

  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    maxBatchSize: MAX_BATCH_SIZE,
    createContext: () => createTRPCContext({ headers: req.headers }),
    onError: ({ path, error, ctx }) => {
      // One JSON line per error, in every environment. Never the input
      // (personal data) and never a stack.
      const internal = error.code === "INTERNAL_SERVER_ERROR";
      const level = internal
        ? "error"
        : error.code === "TOO_MANY_REQUESTS"
          ? "warn"
          : "info";
      const line = JSON.stringify({
        level,
        ts: new Date().toISOString(),
        event: "trpc_error",
        errorId: internal ? errorIdFor(error) : undefined,
        path: path ?? null,
        code: error.code,
        message: internal ? error.message.slice(0, 500) : undefined,
        userId: ctx?.session?.user.id ?? null,
      });
      if (level === "error") console.error(line);
      else if (level === "warn") console.warn(line);
      else console.info(line);
    },
  });
};

export { handler as GET, handler as POST };
