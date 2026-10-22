import { focusElementById } from "@/lib/a11y/focus";

const OPEN_DIALOG =
  '[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]';

/**
 * Focus an element once every open dialog or sheet has closed and returned
 * focus to its trigger (Radix does that when the content unmounts), so our
 * focus wins. An id that isn't rendered yet is waited for as well. Gives up
 * after 1.5 s. `target` is an element id or an element.
 */
export function focusAfterDialogs(target: string | HTMLElement): void {
  if (typeof document === "undefined") return;
  const started = Date.now();
  const exists = () =>
    typeof target === "string"
      ? document.getElementById(target) != null
      : target.isConnected;
  const focus = () => {
    if (typeof target === "string") focusElementById(target);
    else if (target.isConnected) target.focus();
  };
  const blocked = () => !!document.querySelector(OPEN_DIALOG) || !exists();
  if (!blocked()) {
    focus();
    return;
  }
  const attempt = () => {
    if (blocked() && Date.now() - started < 1500) {
      setTimeout(attempt, 50);
      return;
    }
    // One more tick: the closing dialog's own focus return runs first.
    setTimeout(focus, 30);
  };
  attempt();
}
