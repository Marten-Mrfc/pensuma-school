import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { FACILITY_LABELS } from "@/lib/privacy/register";
import { autoDeleteNotice } from "@/lib/privacy/retention";
import { ExamLogSection, facilitiesText, RetentionSection } from "./my-data";

function textOf(html: string): string {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

const retention = {
  attemptsMonths: 24,
  attemptEventsDays: 30,
  inactiveStudentMonths: 12,
};

describe("Mijn gegevens (X05)", () => {
  test("retention caveat comes from autoDeleteNotice (also when confirmed but not automatic)", () => {
    for (const r of [
      { ...retention, confirmed: false, autoDeleteAttempts: false },
      { ...retention, confirmed: false, autoDeleteAttempts: true },
      { ...retention, confirmed: true, autoDeleteAttempts: false },
    ]) {
      const notice = autoDeleteNotice(r);
      expect(notice).not.toBeNull();
      expect(
        textOf(renderToStaticMarkup(<RetentionSection retention={r} />)),
      ).toContain(notice as string);
    }
    const on = { ...retention, confirmed: true, autoDeleteAttempts: true };
    expect(autoDeleteNotice(on)).toBeNull();
    const html = textOf(
      renderToStaticMarkup(<RetentionSection retention={on} />),
    );
    expect(html).not.toContain("niet automatisch verwijderd");
    expect(html).not.toContain("nog definitief vast");
  });

  test("facilities use the register's labels", () => {
    expect(
      facilitiesText({
        extraTimePercent: 0,
        allowPaste: true,
        ignoreFocusEvents: true,
      }),
    ).toBe(
      `${FACILITY_LABELS.allowPaste} · ${FACILITY_LABELS.ignoreFocusEvents}`,
    );
    expect(
      facilitiesText({
        extraTimePercent: 0,
        allowPaste: false,
        ignoreFocusEvents: true,
      }),
    ).not.toContain("geen logboek");
  });

  test("the exam log paragraph says what is recorded, as /privacy does", () => {
    const text = textOf(renderToStaticMarkup(<ExamLogSection />));
    // Always: running and testing code (never the code itself).
    expect(text).toContain("wanneer je je code uitvoert of test");
    expect(text).toContain("Je code zelf staat daar niet in");
    // Only when the toets asks for it.
    expect(text).toContain(
      "toetsvenster of tabblad verlaat, het volledige scherm verlaat of probeert te plakken",
    );
    expect(text).toContain("niet wát je plakt");
    // Never: copying, keystrokes, screen.
    expect(text).toContain("wat je kopieert");
    expect(text).toContain("toetsaanslagen");
    expect(text).toContain(
      "Op de vrije oefenplek (Oefenen) komt niets in het logboek",
    );
  });
});
