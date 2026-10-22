"use client";

import { cn } from "@/lib/utils";

export interface OpenQuestionProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number | null;
  onPaste?: () => void;
  blockPaste?: boolean;
  disabled?: boolean;
}

/** Free text answer with a character counter. */
export function OpenQuestion({
  value,
  onChange,
  maxLength,
  onPaste,
  blockPaste,
  disabled,
}: OpenQuestionProps) {
  const count = value.length;
  const near = maxLength ? count > maxLength * 0.9 : false;
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="open-antwoord" className="text-sm font-medium">
        Jouw antwoord
      </label>
      <textarea
        id="open-antwoord"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={(e) => {
          onPaste?.();
          if (blockPaste) e.preventDefault();
        }}
        maxLength={maxLength ?? undefined}
        disabled={disabled}
        rows={10}
        placeholder="Typ hier je antwoord…"
        spellCheck
        className="min-h-56 w-full resize-y rounded-xl border border-input bg-card px-4 py-3 text-base leading-relaxed shadow-xs transition-[border-color,box-shadow] outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:opacity-60"
      />
      <div className="flex justify-between text-xs text-muted-foreground">
        <span>
          {blockPaste
            ? "Plakken is uitgeschakeld."
            : "Je antwoord wordt automatisch opgeslagen."}
        </span>
        <span
          className={cn("tabular-nums", near && "font-medium text-warning-ink")}
        >
          {maxLength
            ? `${count}/${maxLength} tekens`
            : `${count} ${count === 1 ? "teken" : "tekens"}`}
        </span>
      </div>
    </div>
  );
}
