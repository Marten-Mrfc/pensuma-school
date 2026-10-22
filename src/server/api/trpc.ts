/**
 * tRPC setup: context, procedures and middleware.
 *
 * Procedures:
 *  - publicProcedure   anyone
 *  - protectedProcedure signed-in user (ctx.user)
 *  - adminProcedure    teachers (role "admin")
 *  - studentProcedure  students (role "student")
 */
import { initTRPC, TRPCError } from "@trpc/server";
import superjson from "superjson";
import { ZodError, z } from "zod";
import { ROLES } from "@/lib/auth-shared";
import { auth } from "@/server/auth";
import { db } from "@/server/db";

export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await auth.api.getSession({ headers: opts.headers });
  return {
    db,
    session,
    headers: opts.headers,
    /** Set by auditFromCtx, read by the audit safety net (one per request). */
    auditState: { written: false },
  };
};

export type TRPCContext = Awaited<ReturnType<typeof createTRPCContext>>;

const t = initTRPC.context<TRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? z.flattenError(error.cause) : null,
      },
    };
  },
});

export const createCallerFactory = t.createCallerFactory;
export const createTRPCRouter = t.router;
export const middleware = t.middleware;

/** Adds artificial latency in dev to surface waterfalls. Disabled by default. */
const timingMiddleware = t.middleware(async ({ next, path }) => {
  const start = Date.now();
  const result = await next();
  if (process.env.TRPC_LOG_TIMING) {
    console.log(`[tRPC] ${path} took ${Date.now() - start}ms`);
  }
  return result;
});

export const publicProcedure = t.procedure.use(timingMiddleware);

export const protectedProcedure = publicProcedure.use(({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Je bent niet ingelogd.",
    });
  }
  const user = ctx.session.user as typeof ctx.session.user & {
    role?: string | null;
    username?: string | null;
  };
  return next({
    ctx: {
      session: ctx.session,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role ?? ROLES.student,
        username: user.username ?? null,
      },
    },
  });
});

export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== ROLES.admin) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Alleen voor docenten.",
    });
  }
  return next();
});

export const studentProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (ctx.user.role !== ROLES.student) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Alleen voor leerlingen.",
    });
  }
  return next();
});
