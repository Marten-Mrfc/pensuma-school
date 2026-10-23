"use client";

/**
 * The actual CodeMirror editor. Do not import this directly: use
 * <CodeEditor> from "./code-editor", which loads this lazily on the client.
 */
import { python } from "@codemirror/lang-python";
import {
  HighlightStyle,
  indentUnit,
  syntaxHighlighting,
} from "@codemirror/language";
import { EditorState } from "@codemirror/state";
import { tags as t } from "@lezer/highlight";
import CodeMirror, {
  EditorView,
  type Extension,
  type ReactCodeMirrorRef,
} from "@uiw/react-codemirror";
import { useEffect, useId, useImperativeHandle, useMemo, useRef } from "react";
import { cn } from "@/lib/utils";
import type { CodeEditorProps } from "./code-editor";
import { exitEditorKeymap } from "./code-editor-keys";

/* Colours come from CSS variables (globals.css), so one theme covers light and dark. */
const pensumaTheme = EditorView.theme({
  "&": {
    backgroundColor: "var(--code-bg)",
    color: "var(--code-fg)",
    // Display preference "Lettergrootte in de code-editor" (PreferencesSync).
    fontSize: "var(--code-font-size, 0.875rem)",
    height: "100%",
  },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    fontFamily:
      "var(--font-dm-mono), ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
    lineHeight: "1.65",
  },
  ".cm-content": { caretColor: "var(--primary)", padding: "12px 0" },
  ".cm-line": { padding: "0 16px 0 10px" },
  ".cm-cursor, .cm-dropCursor": {
    borderLeftColor: "var(--primary)",
    borderLeftWidth: "2px",
  },
  ".cm-gutters": {
    backgroundColor: "var(--code-bg)",
    color: "var(--code-gutter)",
    border: "none",
    borderRight: "1px solid var(--border)",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    padding: "0 10px 0 14px",
    minWidth: "2.75em",
  },
  ".cm-activeLine": { backgroundColor: "var(--code-active-line)" },
  ".cm-activeLineGutter": {
    backgroundColor: "var(--code-active-line)",
    color: "var(--foreground)",
  },
  "&.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection":
    { backgroundColor: "var(--code-selection) !important" },
  ".cm-selectionMatch": {
    backgroundColor: "color-mix(in oklch, var(--primary) 12%, transparent)",
  },
  "&.cm-focused .cm-matchingBracket": {
    backgroundColor: "color-mix(in oklch, var(--primary) 20%, transparent)",
    outline: "1px solid color-mix(in oklch, var(--primary) 45%, transparent)",
    borderRadius: "2px",
  },
  "&.cm-focused .cm-nonmatchingBracket": {
    backgroundColor: "color-mix(in oklch, var(--destructive) 18%, transparent)",
  },
  ".cm-placeholder": { color: "var(--muted-foreground)", fontStyle: "italic" },
  ".cm-tooltip": {
    backgroundColor: "var(--popover)",
    color: "var(--popover-foreground)",
    border: "1px solid var(--border)",
    borderRadius: "6px",
    boxShadow: "0 8px 20px -6px rgb(0 0 0 / 0.18)",
    overflow: "hidden",
  },
  ".cm-tooltip-autocomplete > ul > li": { padding: "2px 10px !important" },
  ".cm-tooltip-autocomplete > ul > li[aria-selected]": {
    backgroundColor: "var(--primary)",
    color: "var(--primary-foreground)",
  },
  ".cm-panels": { backgroundColor: "var(--muted)", color: "var(--foreground)" },
  ".cm-panels.cm-panels-bottom": { borderTop: "1px solid var(--border)" },
  ".cm-searchMatch": {
    backgroundColor: "color-mix(in oklch, var(--warning) 35%, transparent)",
  },
});

const pensumaHighlight = HighlightStyle.define([
  {
    tag: [
      t.keyword,
      t.controlKeyword,
      t.operatorKeyword,
      t.definitionKeyword,
      t.moduleKeyword,
    ],
    color: "var(--code-keyword)",
  },
  {
    tag: [t.string, t.special(t.string), t.docString, t.character],
    color: "var(--code-string)",
  },
  { tag: [t.number, t.bool, t.null, t.atom], color: "var(--code-number)" },
  {
    tag: [t.comment, t.lineComment, t.blockComment],
    color: "var(--code-comment)",
    fontStyle: "italic",
  },
  {
    tag: [t.function(t.variableName), t.function(t.propertyName)],
    color: "var(--code-function)",
  },
  {
    tag: [
      t.function(t.definition(t.variableName)),
      t.definition(t.function(t.variableName)),
    ],
    color: "var(--code-function)",
    fontWeight: "500",
  },
  { tag: [t.className, t.definition(t.className)], color: "var(--code-class)" },
  {
    tag: [t.standard(t.variableName), t.self, t.special(t.variableName)],
    color: "var(--code-builtin)",
  },
  {
    tag: [
      t.operator,
      t.compareOperator,
      t.arithmeticOperator,
      t.logicOperator,
      t.updateOperator,
    ],
    color: "var(--code-operator)",
  },
  {
    tag: [
      t.punctuation,
      t.paren,
      t.bracket,
      t.squareBracket,
      t.brace,
      t.separator,
    ],
    color: "var(--code-punctuation)",
  },
  { tag: t.invalid, color: "var(--destructive)" },
]);

/** Dutch UI strings for CodeMirror (search panel, completions, …). */
const DUTCH_PHRASES = EditorState.phrases.of({
  Find: "Zoeken",
  Replace: "Vervangen",
  next: "volgende",
  previous: "vorige",
  all: "alle",
  "match case": "hoofdlettergevoelig",
  regexp: "regex",
  "by word": "hele woorden",
  replace: "vervang",
  "replace all": "alles vervangen",
  close: "sluiten",
  "Go to line": "Ga naar regel",
  go: "ga",
  "Selection deleted": "Selectie verwijderd",
  Completions: "Suggesties",
  "Control character": "Stuurteken",
  "current match": "huidige treffer",
  "on line": "op regel",
  "replaced $ matches": "$ treffers vervangen",
  "replaced match on line $": "treffer op regel $ vervangen",
  "folded code": "ingeklapte code",
  unfold: "uitklappen",
  Diagnostics: "Meldingen",
  "No diagnostics": "Geen meldingen",
});

/** Ctrl+M works on every platform, also on a Mac (see code-editor-keys.ts). */
const EDIT_HINT =
  "Tab springt in, Shift+Tab springt terug. Druk op Escape en daarna Tab, of op Ctrl+M, om de editor te verlaten.";

function toCss(size: string | number | undefined) {
  return typeof size === "number" ? `${size}px` : size;
}

export function CodeEditorView({
  value,
  onChange,
  readOnly = false,
  minHeight = 160,
  maxHeight,
  autoFocus = false,
  blockPaste = false,
  onPaste,
  autocomplete = false,
  placeholder,
  className,
  "aria-label": ariaLabel = "Code-editor",
  "aria-labelledby": ariaLabelledBy,
  "aria-describedby": ariaDescribedBy,
  "aria-invalid": ariaInvalid,
  escapeHint = "escape",
  ref,
}: CodeEditorProps) {
  const hintId = useId();
  const cmRef = useRef<ReactCodeMirrorRef>(null);

  useImperativeHandle(
    ref,
    () => ({
      focus: () => cmRef.current?.view?.focus(),
      goToLine: (line: number) => {
        const view = cmRef.current?.view;
        if (!view) return;
        const { doc } = view.state;
        const n = Math.min(Math.max(1, Math.floor(line) || 1), doc.lines);
        const pos = doc.line(n).from;
        view.dispatch({
          selection: { anchor: pos },
          effects: EditorView.scrollIntoView(pos, { y: "center" }),
        });
        view.focus();
      },
    }),
    [],
  );
  const onPasteRef = useRef(onPaste);
  useEffect(() => {
    onPasteRef.current = onPaste;
  });

  const extensions = useMemo<Extension[]>(
    () => [
      python(),
      exitEditorKeymap,
      indentUnit.of("    "),
      DUTCH_PHRASES,
      pensumaTheme,
      syntaxHighlighting(pensumaHighlight),
      EditorView.contentAttributes.of({
        // aria-labelledby wins over aria-label when both are present.
        ...(ariaLabelledBy
          ? { "aria-labelledby": ariaLabelledBy }
          : { "aria-label": ariaLabel }),
        "aria-describedby": [ariaDescribedBy, hintId].filter(Boolean).join(" "),
        ...(ariaInvalid ? { "aria-invalid": "true" } : {}),
        ...(readOnly ? { "aria-readonly": "true" } : {}),
        // The content is already focusable (contenteditable); an explicit
        // tabindex lets checkers see that the scroll area (.cm-scroller)
        // holds focusable content (axe scrollable-region-focusable), also
        // in the read-only view.
        tabindex: "0",
        translate: "no",
        spellcheck: "false",
        autocorrect: "off",
        autocapitalize: "off",
      }),
      EditorView.domEventHandlers({
        paste(event) {
          onPasteRef.current?.();
          if (!blockPaste) return false;
          event.preventDefault();
          return true;
        },
        drop(event) {
          if (!blockPaste) return false;
          onPasteRef.current?.();
          event.preventDefault();
          return true;
        },
        beforeinput(event) {
          if (!blockPaste) return false;
          if (
            event.inputType === "insertFromPaste" ||
            event.inputType === "insertFromDrop"
          ) {
            event.preventDefault();
            return true;
          }
          return false;
        },
      }),
    ],
    [
      ariaLabel,
      ariaLabelledBy,
      ariaDescribedBy,
      ariaInvalid,
      readOnly,
      blockPaste,
      hintId,
    ],
  );

  return (
    <div
      data-slot="code-editor"
      data-readonly={readOnly ? "" : undefined}
      className={cn(
        "group/editor relative overflow-hidden rounded-lg border border-input bg-[var(--code-bg)] shadow-xs transition-[box-shadow,border-color] focus-within:border-ring focus-within:ring-2 focus-within:ring-ring",
        ariaInvalid && "border-destructive",
        className,
      )}
    >
      <CodeMirror
        ref={cmRef}
        value={value}
        onChange={readOnly ? undefined : (next) => onChange?.(next)}
        // Stay editable (focusable, selectable, scrollable by keyboard) and
        // block changes with readOnly instead.
        editable
        readOnly={readOnly}
        autoFocus={autoFocus}
        placeholder={placeholder}
        minHeight={toCss(minHeight)}
        maxHeight={toCss(maxHeight)}
        theme="none"
        indentWithTab={!readOnly}
        basicSetup={{
          lineNumbers: true,
          highlightActiveLineGutter: !readOnly,
          highlightActiveLine: !readOnly,
          foldGutter: false,
          dropCursor: !blockPaste,
          allowMultipleSelections: true,
          indentOnInput: true,
          bracketMatching: true,
          closeBrackets: false,
          autocompletion: autocomplete,
          completionKeymap: autocomplete,
          rectangularSelection: true,
          crosshairCursor: false,
          highlightSelectionMatches: true,
          searchKeymap: true,
          foldKeymap: false,
          lintKeymap: false,
          tabSize: 4,
        }}
        extensions={extensions}
      />
      <span id={hintId} className="sr-only">
        {readOnly ? "Alleen lezen." : EDIT_HINT}
      </span>
      {!readOnly ? (
        <span
          aria-hidden="true"
          className="pointer-events-none absolute right-2 bottom-2 hidden rounded-md border bg-background/90 px-1.5 py-0.5 font-sans text-[0.68rem] text-muted-foreground opacity-0 shadow-xs transition-opacity group-focus-within/editor:opacity-100 sm:block"
        >
          <kbd className="font-mono">
            {escapeHint === "ctrl-m" ? "Ctrl+M" : "Esc"}
          </kbd>{" "}
          dan <kbd className="font-mono">Tab</kbd> om te verlaten
        </span>
      ) : null}
    </div>
  );
}
