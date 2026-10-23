/**
 * Every tRPC procedure has a Dutch name for the privacy log
 * (/docent/privacy/logboek and its CSV export), so a new procedure never
 * shows up there as a raw code identifier such as "assignment.extendTime".
 *
 * - Teacher mutations (adminProcedure) without a dedicated audit action are
 *   logged as "trpc.mutation" with their path: they need a row label
 *   (`done`, "Afname gesloten") as well as a function name.
 * - Any procedure can appear as the `path` of a security row (rate limit,
 *   refused access): it needs a function name (`fn`).
 */
import { describe, expect, test } from "bun:test";
import {
  auditRowLabel,
  formatAuditDetails,
  PROCEDURE_LABELS,
} from "@/lib/privacy/audit-format";
import { appRouter } from "@/server/api/root";
import { adminProcedure } from "@/server/api/trpc";

type ProcedureDef = { _def: { type: string; middlewares: unknown[] } };

const procedures = appRouter._def.procedures as unknown as Record<
  string,
  ProcedureDef
>;
const adminMiddlewares = (adminProcedure as unknown as ProcedureDef)._def
  .middlewares;
/** Built on adminProcedure: its whole middleware chain is included. */
const isAdmin = (p: ProcedureDef) =>
  adminMiddlewares.every((mw) => p._def.middlewares.includes(mw));

const adminMutations = Object.entries(procedures)
  .filter(([, p]) => p._def.type === "mutation" && isAdmin(p))
  .map(([path]) => path)
  .sort();

describe("Dutch procedure names in the privacy log", () => {
  test("the walk finds the teacher mutations", () => {
    expect(adminMutations.length).toBeGreaterThan(50);
    expect(adminMutations).toContain("assignment.extendTime");
    expect(adminMutations).toContain("class.delete");
    expect(adminMutations).not.toContain("portal.saveAnswer");
  });

  test("every teacher mutation has a row label", () => {
    const missing = adminMutations.filter(
      (path) => !Object.hasOwn(PROCEDURE_LABELS, path),
    );
    expect(missing).toEqual([]);
    for (const path of adminMutations) {
      const label = auditRowLabel("trpc.mutation", { path });
      expect(label).not.toBe("Wijziging");
      expect(label).not.toContain(path);
      expect(formatAuditDetails({ path }, 8, "trpc.mutation")).toBe("");
    }
  });

  test("every procedure has a function name", () => {
    const missing = Object.keys(procedures).filter(
      (path) => !Object.hasOwn(PROCEDURE_LABELS, path),
    );
    expect(missing).toEqual([]);
    for (const path of Object.keys(procedures)) {
      expect(formatAuditDetails({ path }, 8, "security.rate_limited")).toBe(
        `functie: ${PROCEDURE_LABELS[path]?.fn}`,
      );
    }
  });

  test("no stale entries for procedures that no longer exist", () => {
    const stale = Object.keys(PROCEDURE_LABELS).filter(
      (path) => !Object.hasOwn(procedures, path),
    );
    expect(stale).toEqual([]);
  });
});
