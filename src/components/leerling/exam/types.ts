import type {
  AnswerResponse,
  StudentCodeQuestionData,
} from "@/lib/questions/schema";
import type { RouterOutputs } from "@/trpc/react";

export type AttemptData = RouterOutputs["portal"]["getAttempt"];
export type ExamQuestion = AttemptData["questions"][number];
export type ExamSettings = AttemptData["assignment"]["settings"];

/**
 * Student-safe code question data as sent by `portal.getAttempt`: visible
 * tests, checks, hint ids + penalties (no text), the function names the
 * tests call and whether output is compared.
 */
export type CodeData = StudentCodeQuestionData;
export type ChoiceData = {
  multiple: boolean;
  options: { id: string; text: string }[];
};
export type OpenData = { maxLength?: number | null };

export const codeData = (q: ExamQuestion) => q.data as unknown as CodeData;
export const choiceData = (q: ExamQuestion) => q.data as unknown as ChoiceData;
export const openData = (q: ExamQuestion) => q.data as unknown as OpenData;

export type Responses = Record<string, AnswerResponse | undefined>;

/** Same rules as the server: blank, or (code) unchanged starter code. */
export function isAnswered(
  q: ExamQuestion,
  response: AnswerResponse | undefined,
): boolean {
  if (!response) return false;
  switch (q.type) {
    case "code": {
      const code = "code" in response ? response.code : "";
      return (
        code.trim() !== "" && code.trim() !== codeData(q).starterCode.trim()
      );
    }
    case "multiple_choice":
      return "selected" in response && response.selected.length > 0;
    case "open":
      return "text" in response && response.text.trim() !== "";
  }
}

/** Every local key of an attempt starts with this prefix. */
export const ATTEMPT_STORAGE_PREFIX = "pensuma:poging:";

export function storageKey(attemptId: string, suffix = "answers") {
  return `${ATTEMPT_STORAGE_PREFIX}${attemptId}:${suffix}`;
}

/**
 * Remove the local copies of every attempt (answers backup, flags,
 * position) from this browser: shared school PCs keep nothing behind.
 */
export function clearAllAttemptBackups() {
  try {
    const storage = window.localStorage;
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key?.startsWith(ATTEMPT_STORAGE_PREFIX)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
  } catch {
    // Storage blocked: nothing was stored either.
  }
}

export function readStorage<T>(key: string): T | null {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

export function writeStorage(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode / quota: the server copy is what counts.
  }
}

export function removeStorage(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // ignore
  }
}
