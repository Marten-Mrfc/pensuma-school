"use client";

import { Bold, Code, FileCode2, Italic, List, ListOrdered } from "lucide-react";
import { type KeyboardEvent, useId, useLayoutEffect, useRef, useState } from "react";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { Markdown } from "./markdown";

export interface MarkdownEditorProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  /** Minimum height in text rows. Default 6. */
  minRows?: number;
  id?: string;
  className?: string;
  "aria-label"?: string;
}

type Edit = { before: string; after: string; placeholder: string; block?: boolean };

const ACTIONS: { key: string; label: string; shortcut?: string; icon: typeof Bold; edit: Edit }[] = [
  { key: "bold", label: "Vet", shortcut: "Ctrl+B", icon: Bold, edit: { before: "**", after: "**", placeholder: "vet" } },
  { key: "italic", label: "Cursief", shortcut: "Ctrl+I", icon: Italic, edit: { before: "_", after: "_", placeholder: "cursief" } },
  { key: "code", label: "Code in de tekst", icon: Code, edit: { before: "`", after: "`", placeholder: "print()" } },
  {
    key: "codeblock",
    label: "Python-codeblok",
    icon: FileCode2,
    edit: { before: "```python\n", after: "\n```", placeholder: 'print("Hallo")', block: true },
  },
  { key: "list", label: "Opsomming", icon: List, edit: { before: "- ", after: "", placeholder: "punt", block: true } },
  {
    key: "ordered",
    label: "Genummerde lijst",
    icon: ListOrdered,
    edit: { before: "1. ", after: "", placeholder: "stap", block: true },
  },
];

/** Markdown textarea with a small toolbar and "Bewerken" / "Voorbeeld" tabs. */
export function MarkdownEditor({
  value,
  onChange,
  placeholder = "Schrijf hier je tekst… (Markdown mag)",
  minRows = 6,
  id,
  className,
  "aria-label": ariaLabel,
}: MarkdownEditorProps) {
  const autoId = useId();
  const textareaId = id ?? `md-${autoId}`;
  const [tab, setTab] = useState<"edit" | "preview">("edit");
  const ref = useRef<HTMLTextAreaElement>(null);
  const pendingSelection = useRef<[number, number] | null>(null);

  // Grow with the content; restore the caret after toolbar edits.
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure whenever the text or tab changes
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
    if (pendingSelection.current) {
      const [start, end] = pendingSelection.current;
      pendingSelection.current = null;
      el.focus();
      el.setSelectionRange(start, end);
    }
  }, [value, tab]);

  function apply(edit: Edit) {
    const el = ref.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const selected = value.slice(start, end) || edit.placeholder;
    let before = edit.before;
    if (edit.block && start > 0 && value[start - 1] !== "\n") before = `\n${before}`;
    const next = value.slice(0, start) + before + selected + edit.after + value.slice(end);
    const selStart = start + before.length;
    pendingSelection.current = [selStart, selStart + selected.length];
    onChange(next);
  }

  function onKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (!(e.ctrlKey || e.metaKey)) return;
    const key = e.key.toLowerCase();
    const action = key === "b" ? ACTIONS[0] : key === "i" ? ACTIONS[1] : null;
    if (action) {
      e.preventDefault();
      apply(action.edit);
    }
  }

  return (
    <div
      className={cn(
        "overflow-hidden rounded-lg border border-input bg-card shadow-xs transition-[box-shadow,border-color] focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/40",
        className,
      )}
    >
      <div className="flex items-center justify-between gap-2 border-b bg-muted/40 px-1.5 py-1">
        <div role="tablist" aria-label="Weergave" className="flex items-center gap-0.5">
          {(
            [
              ["edit", "Bewerken"],
              ["preview", "Voorbeeld"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              aria-controls={`${textareaId}-${key}`}
              onClick={() => setTab(key)}
              className={cn(
                "h-7 rounded-md px-2.5 text-xs font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50",
                tab === key && "bg-background text-foreground shadow-xs",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === "edit" ? (
          <div className="flex items-center gap-0.5" role="toolbar" aria-label="Opmaak">
            {ACTIONS.map(({ key, label, shortcut, icon: Icon, edit }) => (
              <Tooltip key={key}>
                <TooltipTrigger asChild>
                  <button
                    type="button"
                    aria-label={label}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => apply(edit)}
                    className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-background hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
                  >
                    <Icon className="size-3.5" aria-hidden="true" />
                  </button>
                </TooltipTrigger>
                <TooltipContent>
                  {label}
                  {shortcut ? <span className="ml-1.5 opacity-60">{shortcut}</span> : null}
                </TooltipContent>
              </Tooltip>
            ))}
          </div>
        ) : null}
      </div>

      {tab === "edit" ? (
        <textarea
          ref={ref}
          id={textareaId}
          role="tabpanel"
          aria-label={ariaLabel}
          value={value}
          rows={minRows}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          spellCheck
          className="block w-full resize-none bg-transparent px-3.5 py-3 font-mono text-[0.85rem] leading-6 text-foreground outline-none placeholder:text-muted-foreground"
          style={{ minHeight: `calc(${minRows} * 1.5rem + 1.5rem)` }}
        />
      ) : (
        <div
          id={`${textareaId}-preview`}
          role="tabpanel"
          className="px-4 py-3"
          style={{ minHeight: `calc(${minRows} * 1.5rem + 1.5rem)` }}
        >
          {value.trim() ? (
            <Markdown>{value}</Markdown>
          ) : (
            <p className="py-2 text-sm text-muted-foreground italic">Nog niets om te laten zien.</p>
          )}
        </div>
      )}
      <div className="border-t bg-muted/30 px-3.5 py-1.5 text-[0.7rem] text-muted-foreground">
        Markdown: <code className="font-mono">**vet**</code>, <code className="font-mono">_cursief_</code>,{" "}
        <code className="font-mono">`code`</code> en <code className="font-mono">```python</code>-blokken.
      </div>
    </div>
  );
}
