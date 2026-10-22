import { describe, expect, test } from "bun:test";
import {
  countOutputLines,
  formatSecondsNl,
  inputAnnouncement,
  inputLabel,
  runAnnouncement,
  selfTestAnnouncement,
  testsSummary,
} from "./announcements";

const ok = {
  stdout: "",
  timedOut: false,
  durationMs: 0,
  truncated: false,
  error: null,
};

describe("formatSecondsNl", () => {
  test("uses a decimal comma and drops trailing zeros", () => {
    expect(formatSecondsNl(5000)).toBe("5");
    expect(formatSecondsNl(2500)).toBe("2,5");
    expect(formatSecondsNl(120)).toBe("0,12");
    expect(formatSecondsNl(1234)).toBe("1,2");
  });
  test("never negative", () => {
    expect(formatSecondsNl(-10)).toBe("0");
  });
});

describe("countOutputLines", () => {
  test("ignores one trailing newline", () => {
    expect(countOutputLines("")).toBe(0);
    expect(countOutputLines("a\n")).toBe(1);
    expect(countOutputLines("a\nb")).toBe(2);
    expect(countOutputLines("a\r\nb\r\n")).toBe(2);
  });
  test("counts empty printed lines", () => {
    expect(countOutputLines("\n")).toBe(1);
    expect(countOutputLines("a\n\nb\n")).toBe(3);
  });
  test("500 prints are 500 lines", () => {
    const stdout = Array.from({ length: 500 }, (_, i) => `${i}\n`).join("");
    expect(countOutputLines(stdout)).toBe(500);
  });
});

describe("runAnnouncement", () => {
  test("success with output", () => {
    expect(
      runAnnouncement({ ...ok, stdout: "1\n2\n", durationMs: 420 }, 5000),
    ).toBe("Klaar in 0,42 seconden. 2 regels uitvoer.");
  });
  test("singular line", () => {
    expect(runAnnouncement({ ...ok, stdout: "Hallo\n" }, 5000)).toBe(
      "Klaar in 0 seconden. 1 regel uitvoer.",
    );
  });
  test("success without output", () => {
    expect(runAnnouncement(ok, 5000)).toBe("Klaar. Geen uitvoer.");
  });
  test("error with a line number", () => {
    expect(
      runAnnouncement(
        { ...ok, error: { type: "NameError", line: 3 }, stdout: "x\n" },
        5000,
      ),
    ).toBe("Je programma stopte met een fout op regel 3: NameError.");
  });
  test("error without a line number", () => {
    expect(
      runAnnouncement(
        { ...ok, error: { type: "SandboxCrash", line: null } },
        1,
      ),
    ).toBe("Je programma stopte met een fout: SandboxCrash.");
  });
  test("timeout uses the time limit", () => {
    expect(
      runAnnouncement(
        {
          ...ok,
          timedOut: true,
          error: { type: "TimeoutError", line: null },
        },
        2500,
      ),
    ).toBe("Je programma duurde te lang en is na 2,5 seconden gestopt.");
  });
  test("output cap", () => {
    expect(
      runAnnouncement(
        {
          ...ok,
          truncated: true,
          error: { type: "OutputLimitExceeded", line: null },
        },
        5000,
      ),
    ).toBe("De uitvoer was te lang en is afgekapt.");
  });
  test("stopped by the student", () => {
    expect(
      runAnnouncement({ ...ok, error: { type: "Stopped", line: null } }, 5000),
    ).toBe("Je programma is gestopt.");
  });
});

describe("input()", () => {
  test("label is the trimmed prompt", () => {
    expect(inputLabel("Wat is je naam? ")).toBe("Wat is je naam?");
  });
  test("generic label without a prompt", () => {
    expect(inputLabel("")).toBe("Invoer voor je programma");
    expect(inputLabel("   ")).toBe("Invoer voor je programma");
    expect(inputLabel(null)).toBe("Invoer voor je programma");
  });
  test("announcement", () => {
    expect(inputAnnouncement("Hoe oud ben je? ")).toBe(
      "Je programma wacht op invoer: Hoe oud ben je?",
    );
    expect(inputAnnouncement("")).toBe("Je programma wacht op invoer.");
  });
});

describe("tests", () => {
  test("self-test announcement", () => {
    expect(selfTestAnnouncement(3, 5)).toBe("Testen klaar: 3 van 5 goed.");
    expect(selfTestAnnouncement(0, 0)).toBe("Testen klaar.");
  });
  test("summary heading", () => {
    expect(testsSummary(2, 3)).toBe("2 van 3 tests goed");
    expect(testsSummary(1, 1)).toBe("1 van 1 test goed");
    expect(testsSummary(0, 0)).toBe("Geen tests");
  });
});
