import { describe, expect, test } from "bun:test";
import { pickAuditIds, sanitizeAuditDetails } from "./audit-sanitize";

const uuid = "3f1c2a52-8a4e-4c4b-9a59-0c3b8f6f2d11";

describe("pickAuditIds", () => {
  test("keeps ids, counts id arrays, drops the rest", () => {
    expect(
      pickAuditIds({
        id: "a1",
        name: "Mark",
        pin: "739838",
        userIds: ["a", "b"],
      }),
    ).toEqual({ id: "a1", userIdsCount: 2 });
  });

  test("<name>Id keys with strings ≤64 or numbers", () => {
    expect(
      pickAuditIds({
        attemptId: uuid,
        questionId: 12,
        classId: "x".repeat(65),
        studentNumber: "17053",
        code: "print('hoi')",
        response: { text: "antwoord" },
        Id: "nope",
        paid: "nope",
        ids: [1, 2, 3],
      }),
    ).toEqual({ attemptId: uuid, questionId: 12, idsCount: 3 });
  });

  test("non-objects give {}", () => {
    expect(pickAuditIds(null)).toEqual({});
    expect(pickAuditIds("id")).toEqual({});
    expect(pickAuditIds([{ id: "a" }])).toEqual({});
  });
});

describe("sanitizeAuditDetails", () => {
  test("keeps numbers, booleans, null, dates and enum-like strings", () => {
    expect(
      sanitizeAuditDetails({
        count: 3,
        ok: true,
        until: null,
        at: "2026-10-22T09:00:00.000Z",
        day: "2026-10-22",
        when: new Date("2026-10-22T09:00:00Z"),
        mode: "exam",
        path: "student.resetPin",
        changedKeys: ["school.name", "retention.attemptsMonths"],
      }),
    ).toEqual({
      count: 3,
      ok: true,
      until: null,
      at: "2026-10-22T09:00:00.000Z",
      day: "2026-10-22",
      when: "2026-10-22T09:00:00.000Z",
      mode: "exam",
      path: "student.resetPin",
      changedKeys: ["school.name", "retention.attemptsMonths"],
    });
  });

  test("drops names, PINs, passwords, code, text and nested objects", () => {
    expect(
      sanitizeAuditDetails({
        name: "Mark",
        displayName: "Mark de Vries",
        pin: "739838",
        newPin: "123456",
        password: "geheim-wachtwoord",
        code: "print(1)",
        accessCode: "ABC123",
        text: "mijn antwoord",
        response: { code: "x" },
        studentNumber: "17053",
        nested: { id: "a" },
        long: "x".repeat(41),
        sentence: "dit is een zin",
        nan: Number.NaN,
        big: Array.from({ length: 21 }, () => "a"),
        mixed: ["ok", 1],
        fn: () => 1,
      }),
    ).toBeNull();
  });

  test("keeps counts and flags about sensitive data, not the data", () => {
    expect(
      sanitizeAuditDetails({
        answerId: uuid,
        answerIdsCount: 3,
        pinsCount: 30,
        codeLength: 120,
        passwordChanged: true,
        manualScore: 1.5,
        pin: 739838,
        newPin: 123456,
        studentNumber: 17053,
        username: "17053",
        hasPassword: true,
        nameCount: "3",
      }),
    ).toEqual({
      answerId: uuid,
      answerIdsCount: 3,
      pinsCount: 30,
      codeLength: 120,
      passwordChanged: true,
      manualScore: 1.5,
    });
  });

  test("merges ids from pickAuditIds", () => {
    expect(
      sanitizeAuditDetails({ id: uuid, userIds: ["a", "b"], kind: "dispute" }),
    ).toEqual({
      id: uuid,
      userIds: ["a", "b"],
      userIdsCount: 2,
      kind: "dispute",
    });
    // Ids longer than 40 characters still pass as ids (≤64).
    const longId = "a".repeat(50);
    expect(sanitizeAuditDetails({ userId: longId })).toEqual({
      userId: longId,
    });
  });

  test("non-objects give null", () => {
    expect(sanitizeAuditDetails(null)).toBeNull();
    expect(sanitizeAuditDetails("x")).toBeNull();
    expect(sanitizeAuditDetails([1])).toBeNull();
  });
});

describe("details written by the privacy fixes survive sanitizing", () => {
  test("facility change flags, override flag and similarity details", () => {
    const details = {
      extraTimeChanged: true,
      allowPasteChanged: true,
      focusLogChanged: true,
      facilityActive: false,
      restrictionOverridden: true,
      via: "similarity",
      answerId: uuid,
      scope: "assignment",
      attemptsCount: 4,
    };
    expect(sanitizeAuditDetails(details)).toEqual(details);
  });
});
