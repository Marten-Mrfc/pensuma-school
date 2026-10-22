import { describe, expect, test } from "bun:test";
import {
  ADMIN_MAX_PASSWORD_LENGTH,
  ADMIN_MIN_PASSWORD_LENGTH,
  homeForRole,
  isStudentEmail,
  ROLES,
  ROUTES,
  STUDENT_EMAIL_DOMAIN,
  STUDENT_NUMBER_REGEX,
  STUDENT_PIN_REGEX,
} from "./auth-shared";

describe("STUDENT_NUMBER_REGEX", () => {
  test("accepts 3 to 12 digits", () => {
    for (const nr of ["123", "17053", "123456789012"]) {
      expect(STUDENT_NUMBER_REGEX.test(nr)).toBe(true);
    }
  });

  test("rejects letters, spaces and wrong lengths", () => {
    for (const nr of ["12", "1234567890123", "17a53", " 17053", "", "1.5"]) {
      expect(STUDENT_NUMBER_REGEX.test(nr)).toBe(false);
    }
  });
});

describe("STUDENT_PIN_REGEX", () => {
  test("accepts exactly 6 digits", () => {
    expect(STUDENT_PIN_REGEX.test("739838")).toBe(true);
    expect(STUDENT_PIN_REGEX.test("000123")).toBe(true);
  });

  test("rejects other input", () => {
    for (const pin of ["73983", "7398381", "73983a", "", "739 838"]) {
      expect(STUDENT_PIN_REGEX.test(pin)).toBe(false);
    }
  });
});

describe("homeForRole", () => {
  test("teachers go to /docent, everyone else to /leerling", () => {
    expect(homeForRole(ROLES.admin)).toBe(ROUTES.adminHome);
    expect(homeForRole(ROLES.student)).toBe(ROUTES.studentHome);
    expect(homeForRole(null)).toBe(ROUTES.studentHome);
    expect(homeForRole(undefined)).toBe(ROUTES.studentHome);
    expect(homeForRole("something-else")).toBe(ROUTES.studentHome);
  });
});

describe("constants", () => {
  test("teacher password limits", () => {
    expect(ADMIN_MIN_PASSWORD_LENGTH).toBe(12);
    expect(ADMIN_MAX_PASSWORD_LENGTH).toBe(128);
  });

  test("routes", () => {
    expect(ROUTES.login).toBe("/inloggen");
    expect(ROUTES.setup).toBe("/setup");
  });
});

describe("isStudentEmail", () => {
  test("matches the placeholder domain, case-insensitively", () => {
    expect(isStudentEmail(`17053@${STUDENT_EMAIL_DOMAIN}`)).toBe(true);
    expect(isStudentEmail(` 17053@LEERLING.PENSUMA.LOCAL `)).toBe(true);
  });

  test("does not match other domains", () => {
    expect(isStudentEmail("docent@pensuma.local")).toBe(false);
    expect(isStudentEmail(`x@${STUDENT_EMAIL_DOMAIN}.evil.nl`)).toBe(false);
    expect(isStudentEmail(null)).toBe(false);
    expect(isStudentEmail(undefined)).toBe(false);
  });
});
