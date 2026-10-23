/**
 * A18: the access-code presenter is a real modal dialog (Radix), not a
 * hand-made overlay: focus is trapped inside it (also when the browser
 * refuses fullscreen), the page behind it is hidden from assistive
 * technology, and closing returns focus to the opener, also when it was
 * opened from the "Meer acties" menu. The behaviour itself is checked in
 * the browser (e2e/a11y/teacher-focus.spec.ts).
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";

const source = readFileSync(
  path.join(import.meta.dir, "access-code-presenter.tsx"),
  "utf8",
);

describe("AccessCodePresenter (A18)", () => {
  test("built on the Radix dialog, with focus return from a menu item", () => {
    expect(source).toContain('from "@/components/ui/dialog"');
    expect(source).toContain("<DialogContent");
    expect(source).toContain("useDialogReturnFocus()");
    expect(source).toContain("{...returnFocus}");
  });

  test("no hand-made overlay or global Esc listener any more", () => {
    expect(source).not.toContain("createPortal");
    expect(source).not.toContain('aria-modal="true"');
    expect(source).not.toContain('addEventListener("keydown"');
  });

  test("named and described: title, and the code letter by letter", () => {
    expect(source).toContain("<DialogTitle");
    expect(source).toMatch(/<DialogDescription[^>]*>\s*Toegangscode:/);
  });
});
