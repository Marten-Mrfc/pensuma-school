import { type RefObject, useEffect, useEffectEvent } from "react";

export {
  SHORTCUT_SCOPES,
  SHORTCUTS,
  type ShortcutInfo,
  type ShortcutScope,
  shortcutsByScope,
} from "./shortcut-registry";

/* ------------------------------------------------------------------ */
/* User opt-out                                                        */
/* ------------------------------------------------------------------ */

export const SHORTCUTS_STORAGE_KEY = "pensuma:shortcuts";
const CHANGE_EVENT = "pensuma:shortcuts-change";

/** False when the user switched shortcuts off in the Sneltoetsen dialog. */
export function shortcutsEnabled(): boolean {
  try {
    return globalThis.localStorage?.getItem(SHORTCUTS_STORAGE_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setShortcutsEnabled(enabled: boolean): void {
  try {
    if (enabled) globalThis.localStorage?.removeItem(SHORTCUTS_STORAGE_KEY);
    else globalThis.localStorage?.setItem(SHORTCUTS_STORAGE_KEY, "off");
  } catch {
    // Storage blocked: the setting lasts until the page reloads.
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }
}

/** For useSyncExternalStore: re-read when the opt-out changes. */
export function subscribeShortcutsEnabled(onChange: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", onChange);
  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", onChange);
  };
}

/* ------------------------------------------------------------------ */
/* Pure helpers                                                        */
/* ------------------------------------------------------------------ */

export interface ShortcutKeys {
  /** `event.key`, e.g. "s", "Enter", "ArrowLeft". Letters match any case. */
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  /** Ctrl on Windows/Linux or Cmd on macOS (either one matches). */
  mod?: boolean;
}

type KeyEventLike = Pick<
  KeyboardEvent,
  "key" | "code" | "ctrlKey" | "altKey" | "shiftKey" | "metaKey"
>;

type ElementLike = {
  tagName?: string;
  isContentEditable?: boolean;
  closest?: (selector: string) => unknown;
};

const EDITABLE_TAGS = new Set(["INPUT", "TEXTAREA", "SELECT"]);
const EDITABLE_ANCESTOR =
  '[contenteditable]:not([contenteditable="false"]), .cm-content';

/**
 * True for targets where typing is expected: input, textarea, select,
 * contenteditable elements and the CodeMirror editor (`.cm-content`).
 */
export function isEditableTarget(target: EventTarget | null): boolean {
  if (!target || typeof target !== "object") return false;
  const el = target as ElementLike;
  if (typeof el.tagName !== "string") return false;
  if (EDITABLE_TAGS.has(el.tagName.toUpperCase())) return true;
  if (el.isContentEditable) return true;
  if (typeof el.closest === "function") {
    return el.closest(EDITABLE_ANCESTOR) != null;
  }
  return false;
}

function keyMatches(event: KeyEventLike, key: string): boolean {
  if (event.key === key) return true;
  if (key.length === 1) {
    if (event.key?.toLowerCase() === key.toLowerCase()) return true;
    // Alt/Option changes event.key on macOS ("ß" for Alt+S); use the code.
    if (/^[a-z]$/i.test(key)) return event.code === `Key${key.toUpperCase()}`;
    if (/^\d$/.test(key)) return event.code === `Digit${key}`;
  }
  return false;
}

/** Does this keyboard event match the key combination exactly? */
export function matchesKeys(event: KeyEventLike, keys: ShortcutKeys): boolean {
  if (!keyMatches(event, keys.key)) return false;
  if (keys.mod) {
    if (!(event.ctrlKey || event.metaKey)) return false;
  } else {
    if (event.ctrlKey !== Boolean(keys.ctrl)) return false;
    if (event.metaKey !== Boolean(keys.meta)) return false;
  }
  if (event.altKey !== Boolean(keys.alt)) return false;
  // Symbols such as "?" need Shift on most layouts; don't demand it.
  const implicitShift =
    keys.shift === undefined &&
    keys.key.length === 1 &&
    !/^[a-z0-9]$/i.test(keys.key);
  if (!implicitShift && event.shiftKey !== Boolean(keys.shift)) return false;
  return true;
}

/**
 * WCAG 2.1.4 (Character Key Shortcuts): a shortcut that listens on the whole
 * window needs Ctrl, Alt, Cmd or `mod`. Returns an error message, or null
 * when the shortcut is fine.
 */
export function validateShortcut(input: {
  id: string;
  keys: ShortcutKeys;
  hasScope: boolean;
}): string | null {
  const { keys } = input;
  if (!keys.key) return `Sneltoets "${input.id}" heeft geen toets.`;
  if (input.hasScope) return null;
  if (keys.ctrl || keys.alt || keys.meta || keys.mod) return null;
  return `Sneltoets "${input.id}" (${keys.key}) luistert op het hele venster zonder Ctrl, Alt of Cmd. Dat mag niet (WCAG 2.1.4): geef een modifier of een scope mee.`;
}

/* ------------------------------------------------------------------ */
/* Hook                                                                */
/* ------------------------------------------------------------------ */

export interface UseShortcutOptions {
  /** Unique id, ideally one from SHORTCUTS. */
  id: string;
  /** Dutch description (for debugging and future help overlays). */
  label: string;
  keys: ShortcutKeys;
  /** Listen on this element instead of the window. */
  scope?: RefObject<HTMLElement | null>;
  /** Also fire inside inputs, textareas and the code editor. Default false. */
  allowInEditable?: boolean;
  /** Default true. */
  enabled?: boolean;
  /** Default true: calls preventDefault() when the shortcut fires. */
  preventDefault?: boolean;
  handler: (event: KeyboardEvent) => void;
}

/**
 * Register a keyboard shortcut. Skipped when another handler already called
 * preventDefault(), when typing in an editable element (unless
 * `allowInEditable`), or when the user switched shortcuts off.
 */
export function useShortcut({
  id,
  keys,
  scope,
  allowInEditable = false,
  enabled = true,
  preventDefault = true,
  handler,
}: UseShortcutOptions): void {
  if (process.env.NODE_ENV !== "production") {
    const problem = validateShortcut({ id, keys, hasScope: Boolean(scope) });
    if (problem) throw new Error(problem);
  }

  const onShortcut = useEffectEvent((event: KeyboardEvent) => {
    if (preventDefault) event.preventDefault();
    handler(event);
  });

  const { key, ctrl, alt, shift, meta, mod } = keys;

  useEffect(() => {
    if (!enabled) return;
    const target: HTMLElement | Window | null = scope ? scope.current : window;
    if (!target) return;
    const combo: ShortcutKeys = { key, ctrl, alt, shift, meta, mod };
    const listener = (event: Event) => {
      const e = event as KeyboardEvent;
      if (e.defaultPrevented || e.isComposing) return;
      if (!matchesKeys(e, combo)) return;
      if (!allowInEditable && isEditableTarget(e.target)) return;
      if (!shortcutsEnabled()) return;
      onShortcut(e);
    };
    target.addEventListener("keydown", listener);
    return () => target.removeEventListener("keydown", listener);
  }, [enabled, scope, key, ctrl, alt, shift, meta, mod, allowInEditable]);
}
