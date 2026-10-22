import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { ADMIN_MIN_PASSWORD_LENGTH, ROLES } from "@/lib/auth-shared";
import {
  adminProcedure,
  createTRPCRouter,
  publicProcedure,
} from "@/server/api/trpc";
import { user } from "@/server/db/schema";
import { loadDemoData } from "@/server/demo";
import { createAdminAccount } from "@/server/services/accounts";

async function hasAdmin(db: typeof import("@/server/db").db) {
  const rows = await db
    .select({ id: user.id })
    .from(user)
    .where(eq(user.role, ROLES.admin))
    .limit(1);
  return rows.length > 0;
}

/** First-run setup: create the very first teacher account. */
export const setupRouter = createTRPCRouter({
  status: publicProcedure.query(async ({ ctx }) => ({
    needsSetup: !(await hasAdmin(ctx.db)),
  })),

  createFirstAdmin: publicProcedure
    .input(
      z.object({
        name: z.string().trim().min(2, "Vul je naam in."),
        email: z.email("Vul een geldig e-mailadres in."),
        password: z
          .string()
          .min(
            ADMIN_MIN_PASSWORD_LENGTH,
            `Je wachtwoord moet minstens ${ADMIN_MIN_PASSWORD_LENGTH} tekens hebben.`,
          ),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (await hasAdmin(ctx.db)) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Er bestaat al een docentaccount. Log in.",
        });
      }
      const created = await createAdminAccount(input);
      return { id: created.id, email: created.email };
    }),

  /** Teachers: create the demo class, students, demo test and practice assignment (idempotent). */
  loadDemoData: adminProcedure.mutation(async ({ ctx }) =>
    loadDemoData(ctx.user.id),
  ),
});
