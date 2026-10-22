/**
 * The list of keyboard shortcuts, without React: safe to import from Server
 * Components (the accessibility statement). The hook lives in shortcuts.ts.
 */

/* ------------------------------------------------------------------ */
/* Registry (shown in the Sneltoetsen dialog and on /toegankelijkheid) */
/* ------------------------------------------------------------------ */

export type ShortcutScope = "Code-editor" | "Toets" | "Docent";

export interface ShortcutInfo {
  id: string;
  scope: ShortcutScope;
  /** Keys as shown to people, e.g. "Ctrl+S". */
  keys: string;
  /** macOS variant when it differs, e.g. "Shift+Alt+M". */
  macKeys?: string;
  /** Short description for the dialog. */
  description: string;
  /** Longer description for the accessibility statement. */
  details?: string;
}

/**
 * Every keyboard shortcut in Pensuma. Single-letter shortcuts are not allowed
 * (WCAG 2.1.4); `useShortcut` enforces a modifier for global shortcuts.
 */
export const SHORTCUTS: readonly ShortcutInfo[] = [
  {
    id: "editor-indent",
    scope: "Code-editor",
    keys: "Tab / Shift+Tab",
    description: "inspringen / terugspringen",
    details: "Inspringen / terugspringen",
  },
  {
    id: "editor-leave",
    scope: "Code-editor",
    keys: "Esc, daarna Tab",
    description: "editor verlaten",
    details: "De editor verlaten",
  },
  {
    id: "editor-tab-mode",
    scope: "Code-editor",
    keys: "Ctrl+M",
    macKeys: "Shift+Alt+M",
    description: "Tab-modus wisselen",
    details:
      "Tab wisselen tussen inspringen en naar het volgende onderdeel gaan",
  },
  {
    id: "editor-run",
    scope: "Code-editor",
    keys: "Ctrl+Enter",
    description: "code uitvoeren",
    details: "Je code uitvoeren",
  },
  {
    id: "exam-save",
    scope: "Toets",
    keys: "Ctrl+S",
    description: "nu opslaan",
    details: "Je antwoord meteen opslaan (dat gebeurt ook automatisch)",
  },
  {
    id: "exam-navigate",
    scope: "Toets",
    keys: "Alt+← / Alt+→",
    description: "vorige / volgende vraag (niet in de editor)",
    details: "Naar de vorige / volgende vraag (niet in de code-editor)",
  },
  {
    id: "docent-sidebar",
    scope: "Docent",
    keys: "Ctrl+B",
    description: "zijbalk in- of uitklappen",
    details: "Zijbalk in- of uitklappen",
  },
  {
    id: "docent-review-navigate",
    scope: "Docent",
    keys: "Alt+↑ / Alt+↓",
    description: "vorige / volgende leerling bij nakijken",
    details: "Bij nakijken naar de vorige / volgende leerling",
  },
];

export const SHORTCUT_SCOPES: readonly ShortcutScope[] = [
  "Code-editor",
  "Toets",
  "Docent",
];

/** SHORTCUTS grouped by scope, in registry order. */
export function shortcutsByScope(
  list: readonly ShortcutInfo[] = SHORTCUTS,
): { scope: ShortcutScope; items: ShortcutInfo[] }[] {
  return SHORTCUT_SCOPES.map((scope) => ({
    scope,
    items: list.filter((s) => s.scope === scope),
  })).filter((g) => g.items.length > 0);
}
