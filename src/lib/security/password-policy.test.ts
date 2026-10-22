import { describe, expect, test } from "bun:test";
import { COMMON_PASSWORDS } from "./common-passwords";
import {
  checkPassword,
  containsPersonalInfo,
  isGuessablePassword,
  PASSWORD_MESSAGES,
  teacherPasswordSchema,
  validateTeacherPassword,
} from "./password-policy";

const messageOf = (pw: string, ctx = {}) => {
  const result = validateTeacherPassword(pw, ctx);
  return result.ok ? null : result.message;
};

describe("validateTeacherPassword", () => {
  test("rejects fewer than 12 characters", () => {
    expect(messageOf("kort-woord1")).toBe(PASSWORD_MESSAGES.tooShort);
    expect(messageOf("")).toBe(PASSWORD_MESSAGES.tooShort);
    expect(PASSWORD_MESSAGES.tooShort).toBe(
      "Je wachtwoord moet minstens 12 tekens hebben.",
    );
  });

  test("rejects more than 128 characters", () => {
    expect(messageOf("lange zin ".repeat(13))).toBe(PASSWORD_MESSAGES.tooLong);
    expect(PASSWORD_MESSAGES.tooLong).toBe(
      "Je wachtwoord is te lang (maximaal 128 tekens).",
    );
  });

  test("rejects common passwords, also with digits and symbols", () => {
    for (const pw of [
      "wachtwoord123",
      "Wachtwoord2024!",
      "W@chtw00rd123",
      "welkom01welkom01",
      "Voetbal12345",
      "qwertyuiop123",
      "iloveyou1234",
      "Feyenoord1908",
    ]) {
      expect(messageOf(pw)).toBe(PASSWORD_MESSAGES.guessable);
    }
  });

  test("rejects repeated characters and patterns", () => {
    for (const pw of ["aaaaaaaaaaaa", "abcabcabcabc", "121212121212"]) {
      expect(messageOf(pw)).toBe(PASSWORD_MESSAGES.guessable);
    }
  });

  test("rejects simple sequences", () => {
    for (const pw of [
      "123456789012",
      "abcdefghijkl",
      "zyxwvutsrqpo",
      "1qaz2wsx3edc",
      "123456789abc",
      "asdfghjkl123",
    ]) {
      expect(messageOf(pw)).toBe(PASSWORD_MESSAGES.guessable);
    }
  });

  test("rejects the name, e-mail local part and 'Pensuma'", () => {
    const ctx = {
      email: "marieke.devries@school.nl",
      name: "Marieke de Vries",
    };
    expect(messageOf("ikbenmarieke!42", ctx)).toBe(PASSWORD_MESSAGES.personal);
    expect(messageOf("devries-is-de-baas", ctx)).toBe(
      PASSWORD_MESSAGES.personal,
    );
    expect(messageOf("mijn Pensuma toegang", ctx)).toBe(
      PASSWORD_MESSAGES.personal,
    );
    expect(PASSWORD_MESSAGES.personal).toBe(
      "Je wachtwoord mag niet je naam, e-mailadres of ‘Pensuma’ bevatten.",
    );
  });

  test("short name parts (< 4 characters) are allowed", () => {
    const ctx = { name: "Jan de Bo", email: "jdb@school.nl" };
    expect(messageOf("de paarse koe danst", ctx)).toBeNull();
  });

  test("accepts passphrases and random strings", () => {
    for (const pw of [
      "paarse konijnen fietsen snel",
      "Tx9#mQ2$vL7!",
      "zomervakantie in drenthe",
      "correct horse battery staple",
      "Hondenvoer-op-dinsdag",
    ]) {
      expect(messageOf(pw)).toBeNull();
    }
  });

  test("a few common words together are a passphrase", () => {
    expect(isGuessablePassword("welkom hallo voetbal")).toBe(false);
  });
});

describe("helpers", () => {
  test("the blocklist has about 1000 lower-case entries", () => {
    expect(COMMON_PASSWORDS.size).toBeGreaterThanOrEqual(1000);
    for (const pw of COMMON_PASSWORDS) expect(pw).toBe(pw.toLowerCase());
    for (const pw of ["wachtwoord", "welkom01", "voetbal", "qwerty123"]) {
      expect(COMMON_PASSWORDS.has(pw)).toBe(true);
    }
  });

  test("containsPersonalInfo ignores case and accents", () => {
    expect(containsPersonalInfo("ZOË-zoekt-zon", { name: "Zoë Jansen" })).toBe(
      false,
    );
    expect(
      containsPersonalInfo("JANSEN-ZOEKT-ZON", { name: "Zoë Jansen" }),
    ).toBe(true);
    expect(
      containsPersonalInfo("ik heet rené!!", { name: "René Dijkstra" }),
    ).toBe(true);
  });

  test("checkPassword reports each rule", () => {
    expect(checkPassword("")).toEqual({
      longEnough: false,
      notTooLong: true,
      notPersonal: true,
      notGuessable: true,
    });
    expect(checkPassword("wachtwoord123")).toMatchObject({
      longEnough: true,
      notGuessable: false,
    });
    expect(
      checkPassword("pieter is cool!", { name: "Pieter Post" }),
    ).toMatchObject({ notPersonal: false });
  });

  test("teacherPasswordSchema returns the Dutch message", () => {
    const schema = teacherPasswordSchema({ email: "docent@school.nl" });
    const bad = schema.safeParse("wachtwoord123");
    expect(bad.success).toBe(false);
    expect(bad.error?.issues[0]?.message).toBe(PASSWORD_MESSAGES.guessable);
    expect(schema.safeParse("paarse konijnen fietsen snel").success).toBe(true);
    expect(schema.safeParse("docent-op-school").success).toBe(false);
  });
});
