/**
 * Pure keyboard/focus/announcement logic shared by the teacher pages
 * (review findings A03, A16, A17, A20).
 */
import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { Announce } from "@/components/a11y/live-announcer";
import { type FocusEnv, focusInvalidField } from "./invalid-field-focus";
import { neighbourAfterRemoval } from "./list-focus";
import { nextAnnouncementStep } from "./result-announcement";
import {
  auditRowsMessage,
  existingLabel,
  importPreviewSummary,
  selectionMessage,
  studentsFoundMessage,
  testsFoundMessage,
} from "./result-messages";
import { rovingRadioTarget, rovingTabIndex } from "./roving-radio";

const items = (...ids: string[]) => ids.map((id) => ({ id }));

describe("neighbourAfterRemoval (A03: focus after deleting a list item)", () => {
  test("the next item takes the deleted item's place", () => {
    expect(neighbourAfterRemoval(items("a", "b", "c"), 1)).toBe("c");
    expect(neighbourAfterRemoval(items("a", "b", "c"), 0)).toBe("b");
  });

  test("the last item falls back to the previous one", () => {
    expect(neighbourAfterRemoval(items("a", "b", "c"), 2)).toBe("b");
  });

  test("an emptied list has no neighbour (focus the add button)", () => {
    expect(neighbourAfterRemoval(items("a"), 0)).toBeNull();
    expect(neighbourAfterRemoval([], 0)).toBeNull();
    expect(neighbourAfterRemoval(items("a", "b"), 5)).toBeNull();
  });
});

describe("rovingRadioTarget (A20: radio keyboard model)", () => {
  test("arrows move and wrap at the ends", () => {
    expect(rovingRadioTarget("ArrowRight", 0, 5)).toBe(1);
    expect(rovingRadioTarget("ArrowDown", 4, 5)).toBe(0);
    expect(rovingRadioTarget("ArrowLeft", 0, 5)).toBe(4);
    expect(rovingRadioTarget("ArrowUp", 3, 5)).toBe(2);
  });

  test("Home and End go to the first and last option", () => {
    expect(rovingRadioTarget("Home", 3, 5)).toBe(0);
    expect(rovingRadioTarget("End", 1, 5)).toBe(4);
  });

  test("other keys are left alone (Tab leaves the group)", () => {
    expect(rovingRadioTarget("Tab", 1, 3)).toBeNull();
    expect(rovingRadioTarget(" ", 1, 3)).toBeNull();
    expect(rovingRadioTarget("Enter", 1, 3)).toBeNull();
    expect(rovingRadioTarget("ArrowRight", 0, 0)).toBeNull();
  });

  test("only the checked option is a Tab stop; the first when none is", () => {
    expect([0, 1, 2].map((i) => rovingTabIndex(i, 1))).toEqual([-1, 0, -1]);
    expect([0, 1, 2].map((i) => rovingTabIndex(i, -1))).toEqual([0, -1, -1]);
  });
});

describe("nextAnnouncementStep (A17: announce result counts)", () => {
  test("the first result (page load) is not announced", () => {
    expect(nextAnnouncementStep(null, "|active")).toBe("remember");
  });

  test("a new search or filter is announced", () => {
    expect(nextAnnouncementStep("|active", "zzz|active")).toBe("announce");
    expect(nextAnnouncementStep("zzz|active", "zzz|all")).toBe("announce");
  });

  test("the same search again (polling, refetch) is not", () => {
    expect(nextAnnouncementStep("Jan|all", "Jan|all")).toBe("skip");
  });
});

describe("result messages (A17)", () => {
  test("students: found / none / everyone", () => {
    expect(studentsFoundMessage(3, true)).toBe("3 leerlingen gevonden.");
    expect(studentsFoundMessage(1, true)).toBe("1 leerling gevonden.");
    expect(studentsFoundMessage(0, true)).toBe("Geen leerlingen gevonden.");
    expect(studentsFoundMessage(42, false)).toBe("42 leerlingen in Pensuma.");
  });

  test("tests, monitor selection and audit log", () => {
    expect(testsFoundMessage(0)).toBe("Geen toetsen gevonden.");
    expect(testsFoundMessage(1)).toBe("1 toets gevonden.");
    expect(testsFoundMessage(12)).toBe("12 toetsen gevonden.");
    expect(selectionMessage(0)).toBe("Geen leerlingen in deze selectie.");
    expect(selectionMessage(2)).toBe("2 leerlingen in deze selectie.");
    expect(auditRowsMessage(0, true)).toBe("Geen handelingen gevonden.");
    expect(auditRowsMessage(0, false)).toBe("Nog geen handelingen vastgelegd.");
    expect(auditRowsMessage(50, true)).toBe("50 regels getoond.");
  });

  test("import preview: the chips, read as one sentence", () => {
    expect(existingLabel(1)).toBe("1 bestaat al");
    expect(existingLabel(3)).toBe("3 bestaan al");
    expect(
      importPreviewSummary({ new: 0, existing: 1, member: 0, error: 1 }),
    ).toBe("Voorbeeld: 0 nieuw, 1 bestaat al, 1 met fout.");
    expect(
      importPreviewSummary({ new: 2, existing: 0, member: 1, error: 0 }),
    ).toBe("Voorbeeld: 2 nieuw, 0 bestaan al, 1 al in klas.");
  });
});

describe("result announcements are wired in (A17)", () => {
  const pages: [string, string][] = [
    ["students/students-page.tsx", "studentsFoundMessage("],
    ["tests/tests-page.tsx", "testsFoundMessage("],
    ["assignments/monitor-table.tsx", "selectionMessage("],
    ["classes/import-students-panel.tsx", "importPreviewSummary("],
    ["privacy/audit-log-table.tsx", "auditRowsMessage("],
  ];
  for (const [file, message] of pages) {
    test(file, () => {
      const source = readFileSync(
        path.join(import.meta.dir, "..", file),
        "utf8",
      );
      const call = source.slice(source.indexOf("useResultAnnouncement({"));
      expect(call.length).toBeGreaterThan(0);
      expect(source).toContain("useResultAnnouncement({");
      expect(call.slice(0, 400)).toContain(message);
    });
  }
});

describe("focusInvalidField (A16: silent validation errors)", () => {
  function env(focused: string | null, existing: string[]) {
    const focusCalls: string[] = [];
    const fake: FocusEnv = {
      nextFrame: (fn) => fn(),
      isFocused: (id) => id === focused,
      focus: (id) => {
        focusCalls.push(id);
        return existing.includes(id);
      },
    };
    return { fake, focusCalls };
  }

  test("moves focus to the invalid field (its error is read with it)", () => {
    const announce = mock<Announce>(() => {});
    const { fake, focusCalls } = env("submit", ["name"]);
    focusInvalidField("name", "Geef de klas een naam.", announce, fake);
    expect(focusCalls).toEqual(["name"]);
    expect(announce).not.toHaveBeenCalled();
  });

  test("announces the error when the field already has focus", () => {
    const announce = mock<Announce>(() => {});
    const { fake, focusCalls } = env("name", ["name"]);
    focusInvalidField("name", "Geef de klas een naam.", announce, fake);
    expect(focusCalls).toEqual([]);
    expect(announce).toHaveBeenCalledWith("Geef de klas een naam.", {
      politeness: "assertive",
    });
  });

  test("announces the error when the field can't be found", () => {
    const announce = mock<Announce>(() => {});
    const { fake } = env(null, []);
    focusInvalidField("gone", "Vul je naam in.", announce, fake);
    expect(announce).toHaveBeenCalledTimes(1);
  });

  test("waits a frame (the error renders in the next commit)", () => {
    const announce = mock<Announce>(() => {});
    const frames: (() => void)[] = [];
    const focusCalls: string[] = [];
    focusInvalidField("name", "x", announce, {
      nextFrame: (fn) => frames.push(fn),
      isFocused: () => false,
      focus: (id) => {
        focusCalls.push(id);
        return true;
      },
    });
    expect(focusCalls).toEqual([]);
    frames[0]?.();
    expect(focusCalls).toEqual(["name"]);
  });
});
