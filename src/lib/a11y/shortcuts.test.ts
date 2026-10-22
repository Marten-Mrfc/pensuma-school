import { describe, expect, test } from "bun:test";
import {
  isEditableTarget,
  matchesKeys,
  SHORTCUTS,
  shortcutsByScope,
  validateShortcut,
} from "./shortcuts";

function key(
  k: string,
  mods: Partial<{
    ctrl: boolean;
    alt: boolean;
    shift: boolean;
    meta: boolean;
    code: string;
  }> = {},
) {
  return {
    key: k,
    code: mods.code ?? "",
    ctrlKey: mods.ctrl ?? false,
    altKey: mods.alt ?? false,
    shiftKey: mods.shift ?? false,
    metaKey: mods.meta ?? false,
  };
}

describe("validateShortcut (WCAG 2.1.4)", () => {
  test("a global single-key shortcut is rejected", () => {
    expect(
      validateShortcut({ id: "x", keys: { key: "j" }, hasScope: false }),
    ).toContain("WCAG 2.1.4");
  });

  test("shift alone is not a modifier", () => {
    expect(
      validateShortcut({
        id: "x",
        keys: { key: "j", shift: true },
        hasScope: false,
      }),
    ).not.toBeNull();
  });

  test("ctrl, alt, meta or mod make a global shortcut valid", () => {
    for (const mod of ["ctrl", "alt", "meta", "mod"] as const) {
      expect(
        validateShortcut({
          id: "x",
          keys: { key: "s", [mod]: true },
          hasScope: false,
        }),
      ).toBeNull();
    }
  });

  test("a scoped shortcut may use a single key", () => {
    expect(
      validateShortcut({ id: "x", keys: { key: "j" }, hasScope: true }),
    ).toBeNull();
  });

  test("an empty key is rejected", () => {
    expect(
      validateShortcut({ id: "x", keys: { key: "" }, hasScope: true }),
    ).not.toBeNull();
  });
});

describe("matchesKeys", () => {
  test("letters match case-insensitively with exact modifiers", () => {
    expect(
      matchesKeys(key("s", { ctrl: true }), { key: "s", ctrl: true }),
    ).toBe(true);
    expect(
      matchesKeys(key("S", { ctrl: true }), { key: "s", ctrl: true }),
    ).toBe(true);
    expect(matchesKeys(key("s"), { key: "s", ctrl: true })).toBe(false);
    expect(
      matchesKeys(key("s", { ctrl: true, alt: true }), {
        key: "s",
        ctrl: true,
      }),
    ).toBe(false);
  });

  test("mod matches Ctrl or Cmd", () => {
    expect(matchesKeys(key("s", { ctrl: true }), { key: "s", mod: true })).toBe(
      true,
    );
    expect(matchesKeys(key("s", { meta: true }), { key: "s", mod: true })).toBe(
      true,
    );
    expect(matchesKeys(key("s"), { key: "s", mod: true })).toBe(false);
  });

  test("shift must match for letters and named keys", () => {
    expect(
      matchesKeys(key("ArrowLeft", { alt: true, shift: true }), {
        key: "ArrowLeft",
        alt: true,
      }),
    ).toBe(false);
    expect(
      matchesKeys(key("ArrowLeft", { alt: true }), {
        key: "ArrowLeft",
        alt: true,
      }),
    ).toBe(true);
  });

  test("symbols don't demand an explicit shift", () => {
    expect(
      matchesKeys(key("?", { ctrl: true, shift: true }), {
        key: "?",
        ctrl: true,
      }),
    ).toBe(true);
  });

  test("falls back to event.code when Alt changes the character (macOS)", () => {
    expect(
      matchesKeys(key("ß", { alt: true, code: "KeyS" }), {
        key: "s",
        alt: true,
      }),
    ).toBe(true);
  });
});

describe("isEditableTarget", () => {
  test("form fields are editable", () => {
    expect(
      isEditableTarget({ tagName: "INPUT" } as unknown as EventTarget),
    ).toBe(true);
    expect(
      isEditableTarget({ tagName: "textarea" } as unknown as EventTarget),
    ).toBe(true);
    expect(
      isEditableTarget({ tagName: "SELECT" } as unknown as EventTarget),
    ).toBe(true);
  });

  test("contenteditable and the CodeMirror content are editable", () => {
    expect(
      isEditableTarget({
        tagName: "DIV",
        isContentEditable: true,
      } as unknown as EventTarget),
    ).toBe(true);
    expect(
      isEditableTarget({
        tagName: "SPAN",
        isContentEditable: false,
        closest: (selector: string) =>
          selector.includes(".cm-content") ? {} : null,
      } as unknown as EventTarget),
    ).toBe(true);
  });

  test("buttons, plain elements and null are not editable", () => {
    expect(
      isEditableTarget({
        tagName: "BUTTON",
        closest: () => null,
      } as unknown as EventTarget),
    ).toBe(false);
    expect(isEditableTarget(null)).toBe(false);
    expect(isEditableTarget({} as EventTarget)).toBe(false);
  });
});

describe("SHORTCUTS registry", () => {
  test("ids are unique", () => {
    const ids = SHORTCUTS.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("no single-character shortcut without a modifier", () => {
    for (const s of SHORTCUTS) {
      for (const alternative of s.keys.split(" / ")) {
        const last = alternative.split(", daarna ").at(-1) ?? "";
        const isSingleChar = last.length === 1 && /[a-z0-9]/i.test(last);
        expect(isSingleChar).toBe(false);
      }
    }
  });

  test("grouped in scope order with the dialog copy", () => {
    const groups = shortcutsByScope();
    expect(groups.map((g) => g.scope)).toEqual([
      "Code-editor",
      "Toets",
      "Docent",
    ]);
    const editor = groups[0]?.items.map((i) => `${i.keys}: ${i.description}`);
    expect(editor).toContain("Tab / Shift+Tab: inspringen / terugspringen");
    expect(editor).toContain("Esc, daarna Tab: editor verlaten");
    expect(editor).toContain("Ctrl+M: Tab-modus wisselen");
    expect(editor).toContain("Ctrl+Enter: code uitvoeren");
  });
});
