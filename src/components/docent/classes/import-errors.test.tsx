/**
 * V04: the import panel is a sheet with a focus trap, so its errors are
 * shown inline (role="alert") instead of in a toast that keyboard and
 * screen-reader users can't reach.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { textOf } from "../a11y/render-for-test";
import {
  ImportAlert,
  importFileProblem,
  UNREADABLE_FILE,
} from "./import-students-panel";

describe("import errors inside the sheet (V04)", () => {
  test("spreadsheets and big files are refused with a reason", () => {
    expect(importFileProblem({ name: "4H2.xlsx", size: 10_000 })).toEqual({
      title: "Excel-bestanden kun je niet direct inlezen",
      description:
        "Kopieer de cellen in Excel en plak ze hier, of sla het bestand op als CSV.",
    });
    expect(importFileProblem({ name: "lijst.ODS", size: 1 })?.title).toBe(
      "Excel-bestanden kun je niet direct inlezen",
    );
    expect(importFileProblem({ name: "lijst.csv", size: 2_000_001 })).toEqual({
      title: "Dit bestand is te groot (maximaal 2 MB).",
    });
    expect(importFileProblem({ name: "lijst.csv", size: 2_000 })).toBeNull();
    expect(UNREADABLE_FILE.title).toBe("Dit bestand kon niet worden gelezen.");
  });

  test("the inline alert is announced and readable", () => {
    const html = renderToStaticMarkup(
      <ImportAlert
        problem={{
          title: "Importeren is niet gelukt.",
          description: "Klas niet gevonden.",
        }}
      />,
    );
    expect(html).toMatch(/^<div role="alert"/);
    expect(textOf(html)).toBe("Importeren is niet gelukt. Klas niet gevonden.");
  });

  test("the panel no longer relies on toasts", () => {
    const source = readFileSync(
      path.join(import.meta.dir, "import-students-panel.tsx"),
      "utf8",
    );
    expect(source).not.toContain('from "sonner"');
    expect(source).not.toMatch(/\btoast\./);
    // File problems and the import mutation error both render inline.
    expect(source).toContain("<ImportAlert key={fileError.seq}");
    expect(source).toContain("getErrorMessage(importMutation.error)");
  });
});
