/**
 * Contracts between the student pages and the server (fix group U2):
 *  - A23: a self-chosen access code of up to 20 characters fits the start
 *    screen's field and is accepted by portal.startAttempt.
 *  - A24: the exam page's answer limits match portal.saveAnswer, and the
 *    server's refusal of a too-long answer is classified by the autosave as
 *    "refused" (not "offline").
 */
import { beforeEach, describe, expect, test } from "bun:test";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  ACCESS_CODE_MAX_LENGTH,
  AccessCodeInput,
  normalizeTypedAccessCode,
} from "@/components/leerling/access-code-input";
import { isRejectedError } from "@/components/leerling/exam/answer-saver";
import { OPEN_ANSWER_MAX_LENGTH } from "@/components/leerling/exam/save-problems";
import { db } from "@/server/db";
import { assignments } from "@/server/db/schema";
import { callerFor } from "../support/caller";
import { resetDatabase } from "../support/db";
import { createBasicWorld } from "../support/factories";

beforeEach(resetDatabase);

/** What the browser keeps of typed text: the field's maxlength applies. */
function typeIntoAccessCodeField(typed: string): string {
  const html = renderToStaticMarkup(
    createElement(AccessCodeInput, {
      id: "code",
      value: "",
      onValueChange: () => {},
    }),
  );
  const max = Number(html.match(/maxLength="(\d+)"/i)?.[1]);
  expect(max).toBe(ACCESS_CODE_MAX_LENGTH);
  return normalizeTypedAccessCode(typed).slice(0, max);
}

/** The shape the tRPC client gives the page for a server error. */
function asClientError(err: unknown) {
  const code = err instanceof TRPCError ? err.code : undefined;
  return { message: (err as Error).message, data: { code } };
}

describe("A23: long self-chosen access codes", () => {
  test("a 20-character code set by the teacher can be typed and starts the toets", async () => {
    const w = await createBasicWorld({ mode: "exam" });
    const code = "INFORMATICA-HAVO-4H2";
    expect(code).toHaveLength(20);
    await callerFor(w.teacher).assignment.update({
      id: w.assignment.id,
      accessCode: code,
    });
    const [row] = await db
      .select({ accessCode: assignments.accessCode })
      .from(assignments)
      .where(eq(assignments.id, w.assignment.id));
    expect(row?.accessCode).toBe(code);

    const typed = typeIntoAccessCodeField("informatica-havo-4h2");
    expect(typed).toBe(code);
    const started = await callerFor(w.s1).portal.startAttempt({
      assignmentId: w.assignment.id,
      accessCode: typed,
    });
    expect(started.resumed).toBe(false);
  });

  test("the old 12-character field would have cut it off and been refused", async () => {
    const w = await createBasicWorld({
      mode: "exam",
      accessCode: "INFORMATICA-H3",
    });
    await expect(
      callerFor(w.s1).portal.startAttempt({
        assignmentId: w.assignment.id,
        accessCode: "INFORMATICA-H3".slice(0, 12),
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    await expect(
      callerFor(w.s2).portal.startAttempt({
        assignmentId: w.assignment.id,
        accessCode: typeIntoAccessCodeField("INFORMATICA-H3"),
      }),
    ).resolves.toMatchObject({ resumed: false });
  });
});

describe("A24: open answers over the server limit", () => {
  test("20.000 characters are saved; one more is refused and counts as 'refused', not 'offline'", async () => {
    const w = await createBasicWorld();
    const s1 = callerFor(w.s1);
    const { attemptId } = await s1.portal.startAttempt({
      assignmentId: w.assignment.id,
    });
    await expect(
      s1.portal.saveAnswer({
        attemptId,
        questionId: w.questions.open.id,
        response: { text: "x".repeat(OPEN_ANSWER_MAX_LENGTH) },
      }),
    ).resolves.toMatchObject({ status: expect.any(String) });

    let refused: unknown = null;
    try {
      await s1.portal.saveAnswer({
        attemptId,
        questionId: w.questions.open.id,
        response: { text: "x".repeat(OPEN_ANSWER_MAX_LENGTH + 1) },
      });
    } catch (err) {
      refused = err;
    }
    expect(refused).toBeInstanceOf(TRPCError);
    expect((refused as TRPCError).code).toBe("BAD_REQUEST");
    expect(isRejectedError(asClientError(refused))).toBe(true);

    // Other questions still save afterwards.
    await expect(
      s1.portal.saveAnswer({
        attemptId,
        questionId: w.questions.code.id,
        response: { code: 'print("Hallo wereld!")' },
      }),
    ).resolves.toMatchObject({ status: expect.any(String) });
  });
});
