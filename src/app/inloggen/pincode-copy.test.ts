import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dir, "../../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

/** Source files (no tests) under a directory, relative to the repo root. */
function sourceFiles(dir: string): string[] {
  return readdirSync(path.join(root, dir)).flatMap((name) => {
    const file = path.join(dir, name);
    if (statSync(path.join(root, file)).isDirectory()) return sourceFiles(file);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [file] : [];
  });
}

/**
 * One spelling for students: "pincode" (Woordenlijst), as on the printed
 * login card, the access-code screen and the teacher pages, never "PIN-code".
 */
describe("pincode spelling", () => {
  for (const file of [
    "src/app/inloggen/login-form.tsx",
    "src/components/a11y/accessibility-statement.tsx",
  ]) {
    test(`${file} says "pincode"`, () => {
      expect(read(file)).not.toMatch(/PIN-code/);
    });
  }

  test("no page or component says 'PIN-code(s)' (V03)", () => {
    // E.g. the home page ("leerlingnummer en pincode") and the lock help
    // on the teacher's student pages ("Te veel verkeerde pincodes").
    const offenders = ["src/app", "src/components"]
      .flatMap(sourceFiles)
      .filter((file) => /PIN-codes?/.test(read(file)));
    expect(offenders).toEqual([]);
    expect(read("src/app/page.tsx")).toContain(
      "Leerlingen loggen in met hun leerlingnummer en pincode.",
    );
    expect(read("src/components/docent/students/student-status.tsx")).toContain(
      "Te veel verkeerde pincodes.",
    );
  });

  test("the PIN field is labelled 'Pincode'", () => {
    const source = read("src/app/inloggen/login-form.tsx");
    expect(source).toMatch(/>\s*Pincode\s*<\/label>/);
    expect(source).toContain('aria-label="Pincode tonen"');
    expect(source).toContain("Pincode vergeten?");
  });

  test("the e2e login helpers find the field by that name (V02)", () => {
    const files = [
      "e2e/support/login.ts",
      "e2e/flows/auth.spec.ts",
      "e2e/a11y/keyboard-login.spec.ts",
    ];
    for (const file of files) {
      const source = read(file);
      expect(source).not.toContain('"PIN-code"');
      expect(source).toContain('getByLabel("Pincode", { exact: true })');
    }
    // Tabbing to the field matches on its accessible name, too.
    const keyboard = read("e2e/a11y/keyboard-login.spec.ts");
    expect(keyboard).not.toContain('f.name.includes("PIN")');
    expect(keyboard).toContain('f.name.includes("Pincode")');
  });
});
