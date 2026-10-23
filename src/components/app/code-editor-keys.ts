import { type Extension, Prec } from "@codemirror/state";
import { type Command, keymap } from "@codemirror/view";

/**
 * The editor keeps Tab for indenting, so leaving it with the keyboard needs a
 * documented exit (WCAG 2.1.2 No Keyboard Trap): Escape then Tab, or Ctrl+M
 * then Tab. CodeMirror binds its Tab-focus toggle to Ctrl-m everywhere except
 * macOS, where it uses Shift-Alt-m, and that one never fires (Option+Shift+M
 * types "Â"). Escape is no way out in a fullscreen exam on Safari or Firefox
 * for Mac either: without Keyboard Lock it leaves fullscreen, which the
 * teacher sees and which blocks the exam. So Ctrl+M must work on every
 * platform. On a Mac, Ctrl+M is free (minimising a window is Cmd+M, which is
 * why this is not "Mod-m").
 */
export const EXIT_EDITOR_KEY = "Ctrl-m";

/** Toggle Tab-focus mode: Tab and Shift+Tab move focus instead of indenting. */
export const toggleTabFocus: Command = (view) => {
  view.setTabFocusMode();
  return true;
};

/**
 * Ctrl+M on every platform, also macOS (a binding without a `mac` variant
 * applies there too), ahead of the default keymap.
 */
export const exitEditorKeymap: Extension = Prec.high(
  keymap.of([
    { key: EXIT_EDITOR_KEY, run: toggleTabFocus, preventDefault: true },
  ]),
);
