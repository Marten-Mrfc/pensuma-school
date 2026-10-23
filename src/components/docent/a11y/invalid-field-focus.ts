import type { Announce } from "@/components/a11y/live-announcer";
import { focusElementById } from "@/lib/a11y/focus";

/**
 * After a form submit with validation errors: move focus to the first
 * invalid field, so a screen reader reads its label, the "ongeldig" state
 * and the error text (FormField links it through aria-describedby). The
 * error text itself is plain text, not an alert (see FormField), so
 * without this nothing would be announced (WCAG 3.3.1, 4.1.3).
 *
 * When that field already has focus (Enter pressed inside it), moving focus
 * reads nothing, so the error is announced instead.
 *
 * Runs on the next frame: the error and aria-describedby render in the
 * commit after setState.
 */
export function focusInvalidField(
  id: string,
  message: string,
  announce: Announce,
  env: FocusEnv = browserFocusEnv,
): void {
  env.nextFrame(() => {
    if (env.isFocused(id)) {
      announce(message, { politeness: "assertive" });
      return;
    }
    if (!env.focus(id)) announce(message, { politeness: "assertive" });
  });
}

/** The DOM operations `focusInvalidField` needs (replaceable in tests). */
export interface FocusEnv {
  nextFrame: (fn: () => void) => void;
  /** Whether the element with this id has focus. */
  isFocused: (id: string) => boolean;
  /** Focus the element with this id; false when it doesn't exist. */
  focus: (id: string) => boolean;
}

const browserFocusEnv: FocusEnv = {
  nextFrame: (fn) => {
    requestAnimationFrame(fn);
  },
  isFocused: (id) =>
    typeof document !== "undefined" &&
    document.activeElement !== null &&
    document.activeElement === document.getElementById(id),
  focus: (id) => focusElementById(id),
};
