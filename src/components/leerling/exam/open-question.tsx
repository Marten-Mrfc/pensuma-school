"use client";

import { useEffect, useId, useRef } from "react";
import { useAnnounce } from "@/components/a11y/live-announcer";
import { cn } from "@/lib/utils";

export interface OpenQuestionProps {
  value: string;
  onChange: (value: string) => void;
  maxLength?: number | null;
  /** Fires on every paste attempt with the pasted length (never the text). */
  onPaste?: (length: number) => void;
  blockPaste?: boolean;
  disabled?: boolean;
}

/** Characters left when "Nog 50 tekens over." is announced. */
const NEAR_LIMIT = 50;

/** Free text answer with a character counter. */
export function OpenQuestion({
  value,
  onChange,
  maxLength,
  onPaste,
  blockPaste,
  disabled,
}: OpenQuestionProps) {
  const id = useId();
  const hintId = `${id}-hint`;
  const counterId = `${id}-counter`;
  const announce = useAnnounce();
  const count = value.length;
  const near = maxLength ? count > maxLength * 0.9 : false;

  // Announce reaching the limit once per crossing (not on every key).
  const zone = !maxLength
    ? "free"
    : count >= maxLength
      ? "max"
      : count >= maxLength - NEAR_LIMIT
        ? "near"
        : "free";
  const lastZone = useRef(zone);
  useEffect(() => {
    const previous = lastZone.current;
    lastZone.current = zone;
    if (zone === previous) return;
    if (zone === "max") {
      announce("Je hebt het maximum aantal tekens bereikt.", {
        dedupeKey: "open-max",
      });
    } else if (zone === "near" && previous === "free") {
      announce("Nog 50 tekens over.", { dedupeKey: "open-near" });
    }
  }, [zone, announce]);

  return (
    <div className="flex flex-col gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        Jouw antwoord
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onPaste={(e) => {
          onPaste?.(e.clipboardData?.getData("text").length ?? 0);
          if (blockPaste) {
            e.preventDefault();
            announce("Plakken is uitgezet tijdens deze toets.", {
              dedupeKey: "paste",
            });
          }
        }}
        maxLength={maxLength ?? undefined}
        disabled={disabled}
        rows={10}
        placeholder="Typ hier je antwoord…"
        spellCheck
        aria-describedby={maxLength ? `${hintId} ${counterId}` : hintId}
        className="min-h-56 w-full resize-y rounded-xl border border-input bg-card px-4 py-3 text-base leading-relaxed shadow-xs transition-[border-color,box-shadow] outline-none placeholder:text-muted-foreground/70 focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring disabled:opacity-60"
      />
      <div className="flex justify-between gap-3 text-xs text-muted-foreground">
        <span id={hintId}>
          {blockPaste
            ? "Plakken is uitgeschakeld."
            : "Je antwoord wordt automatisch opgeslagen."}
        </span>
        {maxLength ? (
          <span
            id={counterId}
            className={cn(
              "shrink-0 tabular-nums",
              near && "font-medium text-warning-ink",
            )}
          >
            {count} van {maxLength} tekens
          </span>
        ) : (
          <span className="shrink-0 tabular-nums">
            {count} {count === 1 ? "teken" : "tekens"}
          </span>
        )}
      </div>
    </div>
  );
}
