import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { EditorState } from "@codemirror/state";
import { type EditorView, type KeyBinding, keymap } from "@codemirror/view";
import {
  EXIT_EDITOR_KEY,
  exitEditorKeymap,
  toggleTabFocus,
} from "./code-editor-keys";

function bindingsOf(state: EditorState): KeyBinding[] {
  return state.facet(keymap).flat();
}

describe("exitEditorKeymap (leave the code editor with Ctrl+M)", () => {
  test("binds Ctrl-m without a macOS variant, so it also applies on a Mac", () => {
    const state = EditorState.create({ extensions: [exitEditorKeymap] });
    const binding = bindingsOf(state).find((b) => b.key === EXIT_EDITOR_KEY);
    expect(EXIT_EDITOR_KEY).toBe("Ctrl-m");
    expect(binding).toBeDefined();
    // CodeMirror's own binding is { key: "Ctrl-m", mac: "Shift-Alt-m" }; a
    // `mac` entry would replace Ctrl-m on macOS again.
    expect(binding?.mac).toBeUndefined();
    // Never Cmd+M: that minimises the window on a Mac.
    expect(
      bindingsOf(state).some((b) => /Mod-|Cmd-|Meta-/.test(b.key ?? "")),
    ).toBe(false);
    expect(binding?.preventDefault).toBe(true);
    expect(binding?.run).toBe(toggleTabFocus);
  });

  test("comes before the default keymap", () => {
    const fallback = keymap.of([
      { key: "Ctrl-m", mac: "Shift-Alt-m", run: () => false },
    ]);
    const state = EditorState.create({
      extensions: [fallback, exitEditorKeymap],
    });
    const first = bindingsOf(state).find(
      (b) => b.key === "Ctrl-m" || b.mac === "Ctrl-m",
    );
    expect(first?.run).toBe(toggleTabFocus);
  });

  test("the command toggles Tab-focus mode", () => {
    const calls: unknown[][] = [];
    const view = {
      setTabFocusMode: (...args: unknown[]) => calls.push(args),
    } as unknown as EditorView;
    expect(toggleTabFocus(view)).toBe(true);
    // No argument: toggle (true would only switch it on).
    expect(calls).toEqual([[]]);
  });
});

describe("CodeEditorView", () => {
  test("every code editor gets the Ctrl+M binding", () => {
    // Its hint ("…of op Ctrl+M…") and the exam badge promise it everywhere.
    const source = readFileSync(
      path.join(import.meta.dir, "code-editor-view.tsx"),
      "utf8",
    );
    const extensions = source.slice(source.indexOf("useMemo<Extension[]>("));
    expect(source).toContain(
      'import { exitEditorKeymap } from "./code-editor-keys";',
    );
    expect(extensions).toMatch(
      /^useMemo<Extension\[\]>\(\s*\(\) => \[[^\]]*\bexitEditorKeymap,/,
    );
  });
});
