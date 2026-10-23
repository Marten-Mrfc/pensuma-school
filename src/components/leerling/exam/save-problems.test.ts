import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { type ToastT, toast } from "sonner";
import {
  type AnswerResponse,
  codeResponseSchema,
  openResponseSchema,
} from "@/lib/questions/schema";
import {
  CODE_ANSWER_MAX_LENGTH,
  dismissRejectedToasts,
  OPEN_ANSWER_MAX_LENGTH,
  openAnswerLimit,
  questionNumbersText,
  rejectedAnswerMessage,
  rejectedOnHandInMessage,
  rejectedToastId,
} from "./save-problems";
import type { ExamQuestion } from "./types";

const open = (maxLength?: number) =>
  ({ type: "open", data: { maxLength } }) as unknown as ExamQuestion;
const code = { type: "code", data: {} } as unknown as ExamQuestion;
const mc = { type: "multiple_choice", data: {} } as unknown as ExamQuestion;

describe("answer limits match the server (A24)", () => {
  test("open answers: 20.000 accepted, one more refused", () => {
    const ok = "x".repeat(OPEN_ANSWER_MAX_LENGTH);
    expect(openResponseSchema.safeParse({ text: ok }).success).toBe(true);
    expect(openResponseSchema.safeParse({ text: `${ok}x` }).success).toBe(
      false,
    );
  });

  test("code answers: 100.000 accepted, one more refused", () => {
    const ok = "x".repeat(CODE_ANSWER_MAX_LENGTH);
    expect(codeResponseSchema.safeParse({ code: ok }).success).toBe(true);
    expect(codeResponseSchema.safeParse({ code: `${ok}x` }).success).toBe(
      false,
    );
  });

  test("an empty teacher limit still means at most 20.000", () => {
    expect(openAnswerLimit(undefined)).toBe(20_000);
    expect(openAnswerLimit(null)).toBe(20_000);
    expect(openAnswerLimit(0)).toBe(20_000);
    expect(openAnswerLimit(500)).toBe(500);
    expect(openAnswerLimit(50_000)).toBe(20_000);
  });
});

describe("messages for a refused answer", () => {
  test("too long open answer names the question and the limit", () => {
    expect(
      rejectedAnswerMessage(open(), { text: "x".repeat(20_001) }, 12),
    ).toBe(
      "Je antwoord bij vraag 12 is te lang (maximaal 20.000 tekens) en is niet opgeslagen. Maak het korter.",
    );
    expect(rejectedAnswerMessage(open(300), { text: "x".repeat(301) }, 4)).toBe(
      "Je antwoord bij vraag 4 is te lang (maximaal 300 tekens) en is niet opgeslagen. Maak het korter.",
    );
  });

  test("too long code", () => {
    expect(
      rejectedAnswerMessage(code, { code: "x".repeat(100_001) }, 3),
    ).toContain("Je code bij vraag 3 is te lang (maximaal 100.000 tekens)");
  });

  test("any other refusal gets a general message", () => {
    const cases: [ExamQuestion, AnswerResponse][] = [
      [open(), { text: "kort" }],
      [code, { code: "print(1)" }],
      [mc, { selected: ["a", "b"] }],
    ];
    for (const [q, r] of cases) {
      expect(rejectedAnswerMessage(q, r, 5)).toBe(
        "Je antwoord bij vraag 5 kon niet worden opgeslagen. Pas het aan of vraag je docent om hulp.",
      );
    }
  });

  test("question lists and the hand-in warning", () => {
    expect(questionNumbersText([12])).toBe("vraag 12");
    expect(questionNumbersText([12, 3])).toBe("vraag 3 en 12");
    expect(questionNumbersText([7, 3, 12])).toBe("vraag 3, 7 en 12");
    expect(rejectedOnHandInMessage([12])).toBe(
      "Je antwoord bij vraag 12 is niet opgeslagen. We leveren de laatst opgeslagen versie in.",
    );
    expect(rejectedOnHandInMessage([3, 12])).toBe(
      "Je antwoorden bij vraag 3 en 12 zijn niet opgeslagen. We leveren de laatst opgeslagen versies in.",
    );
  });
});

describe("the 'make it shorter' toast does not outlive the exam", () => {
  // sonner closes a toast on the next animation frame (none in bun).
  const g = globalThis as Record<string, unknown>;
  const raf = g.requestAnimationFrame;
  const caf = g.cancelAnimationFrame;
  beforeEach(() => {
    g.requestAnimationFrame = (cb: () => void) => setTimeout(cb, 0);
    g.cancelAnimationFrame = (id: ReturnType<typeof setTimeout>) =>
      clearTimeout(id);
  });
  afterEach(() => {
    toast.dismiss();
    g.requestAnimationFrame = raf;
    g.cancelAnimationFrame = caf;
  });

  /** Toasts still showing. */
  const showing = () =>
    toast
      .getToasts()
      .filter((t): t is ToastT => !("dismiss" in t))
      .map((t) => t.id);

  test("dismissRejectedToasts closes exactly those questions' toasts", () => {
    toast.error("Je antwoord bij vraag 12 is te lang…", {
      id: rejectedToastId("q12"),
    });
    toast.error("Je antwoord bij vraag 3 is te lang…", {
      id: rejectedToastId("q3"),
    });
    toast.warning("Iets anders", { id: "other" });
    expect(showing()).toContain("save-rejected-q12");

    dismissRejectedToasts(["q12", "q3"]);
    expect(showing()).not.toContain("save-rejected-q12");
    expect(showing()).not.toContain("save-rejected-q3");
    expect(showing()).toContain("other");
  });

  test("the exam closes them on hand-in and when it unmounts", () => {
    const source = fs.readFileSync(
      path.join(import.meta.dir, "exam-runner.tsx"),
      "utf8",
    );
    // On hand-in, the hand-in warning replaces them.
    expect(source).toContain("dismissRejectedToasts(snap.rejected);");
    // Leaving the page (e.g. to the result page after handing in).
    expect(source).toContain(
      "useEffect(() => () => dismissRejectedToasts(lastRejected.current), []);",
    );
  });
});
