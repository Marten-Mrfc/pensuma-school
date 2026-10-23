/**
 * V09: bulk actions that skip students whose processing is restricted
 * (AVG art. 18) say so to the teacher, instead of a count that silently
 * doesn't add up.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRenderer, textOf } from "./a11y/render-for-test";
import {
  existingStatusText,
  ImportResultView,
  skippedForRestriction,
} from "./classes/import-result-view";
import type {
  ImportContext,
  ImportResult,
} from "./classes/import-students-panel";
import {
  exportToast,
  gradeManyToast,
  regradeAssignmentToast,
  restrictedAnswersSkipNote,
  restrictedAttemptsSkipNote,
  restrictedExportNote,
} from "./review/copy";

const read = (file: string) =>
  readFileSync(path.join(import.meta.dir, file), "utf8");

describe("skipped because the processing is restricted (V09)", () => {
  test("the notes agree with the count and name AVG art. 18", () => {
    expect(restrictedAnswersSkipNote(0)).toBe("");
    expect(restrictedAnswersSkipNote(1)).toBe(
      "1 antwoord overgeslagen: de verwerking is beperkt (AVG art. 18). Dat antwoord houdt zijn huidige score.",
    );
    expect(restrictedAnswersSkipNote(2)).toStartWith(
      "2 antwoorden overgeslagen: de verwerking is beperkt (AVG art. 18).",
    );
    expect(restrictedAttemptsSkipNote(0)).toBe("");
    expect(restrictedAttemptsSkipNote(1)).toStartWith(
      "1 poging overgeslagen: de verwerking is beperkt (AVG art. 18).",
    );
    expect(restrictedAttemptsSkipNote(3)).toStartWith(
      "3 pogingen overgeslagen",
    );
    expect(restrictedExportNote(0)).toBe("");
    expect(restrictedExportNote(1)).toBe(
      "Bij 1 leerling staan geen resultaten: de verwerking is beperkt (AVG art. 18).",
    );
    expect(restrictedExportNote(2)).toStartWith("Bij 2 leerlingen staan");
  });

  test("feedback.gradeMany: saved, partly skipped, or nothing saved", () => {
    expect(
      gradeManyToast({ updated: 3, recomputed: true, skippedRestricted: 0 }),
    ).toEqual({
      tone: "success",
      title: "Beoordeling opgeslagen voor 3 antwoorden",
    });
    expect(
      gradeManyToast({ updated: 3, recomputed: true, skippedRestricted: 2 }),
    ).toEqual({
      tone: "warning",
      title: "Beoordeling opgeslagen voor 3 antwoorden",
      description: restrictedAnswersSkipNote(2),
    });
    // Before: "Beoordeling opgeslagen voor 0 antwoorden".
    expect(
      gradeManyToast({ updated: 0, recomputed: true, skippedRestricted: 1 }),
    ).toEqual({
      tone: "warning",
      title: "Er is niets opgeslagen",
      description: restrictedAnswersSkipNote(1),
    });
    expect(
      gradeManyToast({ updated: 1, recomputed: false, skippedRestricted: 1 })
        .description,
    ).toBe(restrictedAnswersSkipNote(1));
  });

  test("review.regradeAssignment", () => {
    expect(
      regradeAssignmentToast({ scheduled: 4, skippedRestricted: 0 }),
    ).toEqual({
      tone: "success",
      title: "4 pogingen worden opnieuw nagekeken",
      description: "Scores en cijfers worden vanzelf bijgewerkt.",
    });
    const partly = regradeAssignmentToast({
      scheduled: 4,
      skippedRestricted: 1,
    });
    expect(partly.tone).toBe("warning");
    expect(partly.description).toContain(restrictedAttemptsSkipNote(1));
    const none = regradeAssignmentToast({ scheduled: 0, skippedRestricted: 2 });
    expect(none).toEqual({
      tone: "warning",
      title: "Er is geen poging om opnieuw na te kijken",
      description: restrictedAttemptsSkipNote(2),
    });
    expect(
      regradeAssignmentToast({ scheduled: 0, skippedRestricted: 0 }).tone,
    ).toBe("info");
  });

  test("review.exportCsv", () => {
    expect(exportToast({ filename: "x.csv", restrictedCount: 0 })).toEqual({
      tone: "success",
      title: "Export gedownload",
      description: "x.csv",
    });
    expect(exportToast({ filename: "x.csv", restrictedCount: 2 })).toEqual({
      tone: "warning",
      title: "Export gedownload",
      description: `x.csv. ${restrictedExportNote(2)}`,
    });
  });

  test("the screens show these messages", () => {
    const scoreBox = read("review/score-box.tsx");
    expect(scoreBox).toContain("showToast(gradeManyToast(res))");
    const results = read("review/results-view.tsx");
    expect(results).toContain("showToast(exportToast(res))");
    expect(results).toContain("showToast(regradeAssignmentToast(res))");
    // class.addMembers already did (add-existing-panel).
    expect(read("classes/add-existing-panel.tsx")).toContain(
      "restrictedSkipNote(res.skippedRestricted)",
    );
  });
});

type Existing = ImportResult["existing"][number];

const existing = (over: Partial<Existing>): Existing => ({
  id: "u1",
  studentNumber: "17054",
  name: "Sem de Vries",
  importedName: "Sem de Vries",
  nameUpdated: false,
  restricted: false,
  addedToClass: false,
  ...over,
});

describe("import result: restricted existing students (V09)", () => {
  test("status per existing student", () => {
    expect(existingStatusText(existing({ restricted: true }))).toBe(
      "Niet toegevoegd en niet hernoemd: verwerking beperkt (AVG art. 18)",
    );
    expect(existingStatusText(existing({ addedToClass: true }))).toBe(
      "Toegevoegd aan de klas",
    );
    expect(
      existingStatusText(existing({ addedToClass: true, nameUpdated: true })),
    ).toBe("Toegevoegd aan de klas · naam bijgewerkt");
    expect(existingStatusText(existing({}))).toBe("Zat al in de klas");
  });

  test("the result view says who was skipped, not 'Zat al in de klas'", () => {
    const { render } = createRenderer();
    const result: ImportResult = {
      created: [],
      existing: [
        existing({ id: "u1", restricted: true }),
        existing({
          id: "u2",
          studentNumber: "17053",
          name: "Emma Smit",
          addedToClass: true,
        }),
      ],
      errors: [],
    };
    const text = textOf(
      render(
        <ImportResultView
          classId="c1"
          className="4H2"
          result={result}
          onImportMore={() => {}}
          onDone={() => {}}
        />,
      ),
    );
    expect(text).toContain("1 leerling toegevoegd aan 4H2");
    expect(text).toContain(
      "1 leerling overgeslagen: voor deze leerling is de verwerking beperkt (AVG art. 18).",
    );
    expect(text).toContain(
      "Niet toegevoegd en niet hernoemd: verwerking beperkt (AVG art. 18)",
    );
    expect(text).not.toContain("Zat al in de klas");
  });
});

describe("import result: a restricted student already in the class", () => {
  const inClass = (renameAsked: boolean): ImportContext => ({
    alreadyInClass: new Set(["u1"]),
    renameAsked,
  });
  const NOT_ADDED =
    "Niet toegevoegd en niet hernoemd: verwerking beperkt (AVG art. 18)";

  test("is not reported as 'niet toegevoegd'", () => {
    const sem = existing({ id: "u1", restricted: true });
    expect(existingStatusText(sem, inClass(false))).toBe("Zat al in de klas");
    expect(skippedForRestriction(sem, inClass(false))).toBe(false);
    // Same name: asking for new names changes nothing either.
    expect(skippedForRestriction(sem, inClass(true))).toBe(false);
    // Not in the class before the import: left out, as before.
    const outside: ImportContext = {
      alreadyInClass: new Set(),
      renameAsked: false,
    };
    expect(existingStatusText(sem, outside)).toBe(NOT_ADDED);
    expect(skippedForRestriction(sem, outside)).toBe(true);
  });

  test("says so when a new name was asked for but not applied", () => {
    const renamed = existing({
      id: "u1",
      restricted: true,
      importedName: "Sem de Vries-Bakker",
    });
    expect(skippedForRestriction(renamed, inClass(true))).toBe(true);
    expect(existingStatusText(renamed, inClass(true))).toBe(
      "Zat al in de klas · naam niet bijgewerkt: verwerking beperkt (AVG art. 18)",
    );
    // Without "Namen bijwerken" nothing was skipped.
    expect(existingStatusText(renamed, inClass(false))).toBe(
      "Zat al in de klas",
    );
  });

  test("the result view shows no skip warning for them", () => {
    const { render } = createRenderer();
    const text = textOf(
      render(
        <ImportResultView
          classId="c1"
          className="4H2"
          result={{
            created: [],
            existing: [existing({ id: "u1", restricted: true })],
            errors: [],
          }}
          context={inClass(false)}
          onImportMore={() => {}}
          onDone={() => {}}
        />,
      ),
    );
    expect(text).toContain("Zat al in de klas");
    expect(text).not.toContain("overgeslagen");
    expect(text).not.toContain("Niet toegevoegd");
  });

  test("the panel remembers who was in the class when importing", () => {
    const panel = read("classes/import-students-panel.tsx");
    // Taken from the preview at submit: afterwards everyone is a member.
    expect(panel).toMatch(
      /importContext\.current = \{\s*alreadyInClass: new Set\(\s*\[\.\.\.existing\.values\(\)\]\.filter\(\(e\) => e\.inClass\)/,
    );
    const sheet = read("classes/add-students-sheet.tsx");
    expect(sheet).toContain("context={importContext}");
  });
});
