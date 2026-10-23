import type { AnswerResponse } from "@/lib/questions/schema";
import { formatNumber } from "../format";
import type { ExamQuestion, OpenData } from "./types";

/**
 * Answer-size limits of the server (`openResponseSchema` and
 * `codeResponseSchema` in src/lib/questions/schema.ts; a unit test keeps
 * them in step). An answer over the limit is refused by `portal.saveAnswer`.
 */
export const OPEN_ANSWER_MAX_LENGTH = 20_000;
export const CODE_ANSWER_MAX_LENGTH = 100_000;

/**
 * The effective character limit of an open question: the teacher's
 * "Max. aantal tekens", but never more than the server accepts (an empty
 * field means "no limit of my own", not "unlimited").
 */
export function openAnswerLimit(maxLength?: number | null): number {
  return maxLength && maxLength > 0
    ? Math.min(maxLength, OPEN_ANSWER_MAX_LENGTH)
    : OPEN_ANSWER_MAX_LENGTH;
}

type QuestionLike = Pick<ExamQuestion, "type" | "data">;

/**
 * Why the server refused this answer, as one Dutch sentence for the
 * student ("vraag 12" is the number they see).
 */
export function rejectedAnswerMessage(
  question: QuestionLike,
  response: AnswerResponse | undefined,
  number: number,
): string {
  if (question.type === "open") {
    const text = response && "text" in response ? response.text : "";
    const limit = openAnswerLimit((question.data as OpenData).maxLength);
    if (text.length > limit) {
      return `Je antwoord bij vraag ${number} is te lang (maximaal ${formatNumber(limit)} tekens) en is niet opgeslagen. Maak het korter.`;
    }
  }
  if (question.type === "code") {
    const code = response && "code" in response ? response.code : "";
    if (code.length > CODE_ANSWER_MAX_LENGTH) {
      return `Je code bij vraag ${number} is te lang (maximaal ${formatNumber(CODE_ANSWER_MAX_LENGTH)} tekens) en is niet opgeslagen. Maak hem korter.`;
    }
  }
  return `Je antwoord bij vraag ${number} kon niet worden opgeslagen. Pas het aan of vraag je docent om hulp.`;
}

/** "vraag 12" or "vraag 3, 7 en 12". */
export function questionNumbersText(numbers: readonly number[]): string {
  const sorted = [...numbers].sort((a, b) => a - b);
  if (sorted.length <= 1) return `vraag ${sorted[0] ?? ""}`.trim();
  return `vraag ${sorted.slice(0, -1).join(", ")} en ${sorted.at(-1)}`;
}

/** The warning when handing in with refused answers. */
export function rejectedOnHandInMessage(numbers: readonly number[]): string {
  return numbers.length === 1
    ? `Je antwoord bij ${questionNumbersText(numbers)} is niet opgeslagen. We leveren de laatst opgeslagen versie in.`
    : `Je antwoorden bij ${questionNumbersText(numbers)} zijn niet opgeslagen. We leveren de laatst opgeslagen versies in.`;
}
