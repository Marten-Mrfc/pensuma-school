"use client";

import { useId, useState } from "react";
import { NumberInput } from "@/components/docent/questions/fields";
import { NativeSelect } from "@/components/ui/select";
import { EXTRA_TIME_PRESETS } from "@/lib/accommodations";

const OTHER = "anders";

/**
 * “Verlengde tijd”: Geen / +10% / +20% / +25% / +33% / +50% / Anders…
 * (Anders shows a “Percentage” number field, 1–100).
 */
export function ExtraTimeField({
  value,
  onChange,
  describedBy,
}: {
  value: number;
  onChange: (percent: number) => void;
  describedBy?: string;
}) {
  const id = useId();
  const isPreset =
    value === 0 || (EXTRA_TIME_PRESETS as readonly number[]).includes(value);
  const [other, setOther] = useState(!isPreset);
  const showOther = other || !isPreset;

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1.5">
        <label htmlFor={`${id}-select`} className="text-sm font-medium">
          Verlengde tijd
        </label>
        <NativeSelect
          id={`${id}-select`}
          aria-describedby={describedBy}
          value={showOther ? OTHER : String(value)}
          onChange={(e) => {
            if (e.target.value === OTHER) {
              setOther(true);
              if (value === 0) onChange(15);
            } else {
              setOther(false);
              onChange(Number(e.target.value));
            }
          }}
        >
          <option value="0">Geen</option>
          {EXTRA_TIME_PRESETS.map((p) => (
            <option key={p} value={String(p)}>
              +{p}%
            </option>
          ))}
          <option value={OTHER}>Anders…</option>
        </NativeSelect>
      </div>
      {showOther ? (
        <div className="flex flex-col gap-1.5">
          <label htmlFor={`${id}-pct`} className="text-sm font-medium">
            Percentage
          </label>
          <NumberInput
            id={`${id}-pct`}
            value={value}
            min={1}
            max={100}
            step={1}
            suffix="%"
            className="w-32"
            onChange={(v) => v !== undefined && onChange(Math.round(v))}
          />
        </div>
      ) : null}
    </div>
  );
}
