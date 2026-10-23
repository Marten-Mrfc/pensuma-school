import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dir, "../../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

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

  test("the PIN field is labelled 'Pincode'", () => {
    const source = read("src/app/inloggen/login-form.tsx");
    expect(source).toMatch(/>\s*Pincode\s*<\/label>/);
    expect(source).toContain('aria-label="Pincode tonen"');
    expect(source).toContain("Pincode vergeten?");
  });
});
