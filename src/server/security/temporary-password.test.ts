import { describe, expect, test } from "bun:test";
import { validateTeacherPassword } from "@/lib/security/password-policy";
import { generateTemporaryPassword } from "./temporary-password";

describe("generateTemporaryPassword", () => {
  test("four words and two digits", () => {
    for (let i = 0; i < 200; i++) {
      expect(generateTemporaryPassword()).toMatch(
        /^[a-z]+-[a-z]+-[a-z]+-[a-z]+-\d{2}$/,
      );
    }
  });

  test("always passes the teacher password policy", () => {
    for (let i = 0; i < 500; i++) {
      const pw = generateTemporaryPassword();
      expect({ pw, result: validateTeacherPassword(pw) }).toEqual({
        pw,
        result: { ok: true },
      });
    }
  });

  test("is random", () => {
    const seen = new Set(
      Array.from({ length: 100 }, () => generateTemporaryPassword()),
    );
    expect(seen.size).toBeGreaterThan(95);
  });
});
