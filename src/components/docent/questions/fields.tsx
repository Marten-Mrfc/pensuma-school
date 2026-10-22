"use client";

import { CircleHelp } from "lucide-react";
import type React from "react";
import { type ReactNode, useId, useLayoutEffect, useRef, useState } from "react";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

/* -------------------------------------------------------------------------- */
/*                                   Section                                  */
/* -------------------------------------------------------------------------- */

export interface EditorSectionProps {
  title: ReactNode;
  description?: ReactNode;
  icon?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}

/** A titled card block inside the question editor. */
export function EditorSection({
  title,
  description,
  icon,
  actions,
  children,
  className,
  id,
}: EditorSectionProps) {
  return (
    <section
      id={id}
      className={cn("rounded-xl border bg-card text-card-foreground shadow-xs", className)}
    >
      <header className="flex flex-col gap-3 border-b px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex min-w-0 items-start gap-3">
          {icon ? (
            <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-muted text-muted-foreground [&>svg]:size-4">
              {icon}
            </span>
          ) : null}
          <div className="flex min-w-0 flex-col gap-0.5">
            <h2 className="text-[0.95rem] leading-snug font-semibold">{title}</h2>
            {description ? (
              <p className="text-xs leading-relaxed text-pretty text-muted-foreground sm:text-[0.8rem]">
                {description}
              </p>
            ) : null}
          </div>
        </div>
        {actions ? <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div> : null}
      </header>
      <div className="flex flex-col gap-5 px-4 py-4 sm:px-5 sm:py-5">{children}</div>
    </section>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 NumberInput                                */
/* -------------------------------------------------------------------------- */

export interface NumberInputProps {
  value: number | undefined;
  /** Called with a valid number (clamped), or `undefined` when cleared and `allowEmpty`. */
  onChange: (value: number | undefined) => void;
  min?: number;
  max?: number;
  step?: number;
  allowEmpty?: boolean;
  id?: string;
  placeholder?: string;
  className?: string;
  suffix?: ReactNode;
  "aria-label"?: string;
  "aria-describedby"?: string;
  "aria-invalid"?: boolean;
}

function format(value: number | undefined) {
  return value === undefined || Number.isNaN(value) ? "" : String(value);
}

/**
 * Number field that accepts Dutch decimal commas and intermediate input
 * ("1," or "") without fighting the user; commits only valid numbers.
 */
export function NumberInput({
  value,
  onChange,
  min,
  max,
  step = 1,
  allowEmpty = false,
  id,
  placeholder,
  className,
  suffix,
  ...aria
}: NumberInputProps) {
  const [text, setText] = useState(format(value));
  const [focused, setFocused] = useState(false);
  const shown = focused ? text : format(value);

  function commit(raw: string, final: boolean) {
    const normalized = raw.replace(",", ".").trim();
    if (normalized === "") {
      if (allowEmpty) onChange(undefined);
      return;
    }
    const n = Number(normalized);
    if (!Number.isFinite(n)) return;
    let clamped = n;
    if (min !== undefined && clamped < min) {
      if (!final) return;
      clamped = min;
    }
    if (max !== undefined && clamped > max) clamped = max;
    onChange(clamped);
  }

  return (
    <Input
      id={id}
      inputMode="decimal"
      value={shown}
      placeholder={placeholder}
      suffix={suffix ? <span className="pr-1 text-xs text-muted-foreground">{suffix}</span> : undefined}
      onFocus={() => {
        setText(format(value));
        setFocused(true);
      }}
      onBlur={() => {
        commit(text, true);
        setFocused(false);
      }}
      onChange={(e) => {
        setText(e.target.value);
        commit(e.target.value, false);
      }}
      onKeyDown={(e) => {
        if (e.key !== "ArrowUp" && e.key !== "ArrowDown") return;
        e.preventDefault();
        const base = value ?? min ?? 0;
        const next = Math.round((base + (e.key === "ArrowUp" ? step : -step)) * 1000) / 1000;
        const clamped = Math.min(max ?? Infinity, Math.max(min ?? -Infinity, next));
        setText(String(clamped));
        onChange(clamped);
      }}
      className={cn("tabular-nums", className)}
      {...aria}
    />
  );
}

/* -------------------------------------------------------------------------- */
/*                                 SwitchField                                */
/* -------------------------------------------------------------------------- */

export function SwitchField({
  label,
  description,
  checked,
  onCheckedChange,
  disabled,
  className,
}: {
  label: ReactNode;
  description?: ReactNode;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled?: boolean;
  className?: string;
}) {
  const id = useId();
  return (
    <div
      className={cn(
        "flex items-start justify-between gap-4 rounded-lg border bg-background/60 px-3.5 py-3",
        disabled && "opacity-60",
        className,
      )}
    >
      <div className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={id} className="text-sm leading-snug font-medium">
          {label}
        </label>
        {description ? (
          <p id={`${id}-d`} className="text-xs leading-relaxed text-muted-foreground">
            {description}
          </p>
        ) : null}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onCheckedChange}
        disabled={disabled}
        aria-describedby={description ? `${id}-d` : undefined}
        className="mt-0.5"
      />
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                 HelpPopover                                */
/* -------------------------------------------------------------------------- */

export function HelpPopover({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={label}
          className="inline-grid size-5 place-items-center rounded-full text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <CircleHelp className="size-4" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className={cn("w-[min(28rem,calc(100vw-2rem))] p-0 text-sm", className)}
      >
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** Small label row: text + optional help/extra on the right. */
export function FieldLabel({
  htmlFor,
  children,
  extra,
  className,
}: {
  htmlFor?: string;
  children: ReactNode;
  extra?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-5 items-center justify-between gap-2", className)}>
      <label htmlFor={htmlFor} className="flex items-center gap-1.5 text-sm leading-none font-medium">
        {children}
      </label>
      {extra}
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*                                AutoTextarea                                */
/* -------------------------------------------------------------------------- */

export interface AutoTextareaProps
  extends Omit<React.TextareaHTMLAttributes<HTMLTextAreaElement>, "onChange" | "value"> {
  value: string;
  onValueChange: (value: string) => void;
  /** Monospace (code / program output). */
  mono?: boolean;
  minRows?: number;
}

/** Plain textarea that grows with its content. */
export function AutoTextarea({
  value,
  onValueChange,
  mono,
  minRows = 2,
  className,
  ...props
}: AutoTextareaProps) {
  const ref = useRef<HTMLTextAreaElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: re-measure when the text changes
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight + 2}px`;
  }, [value]);
  return (
    <textarea
      ref={ref}
      value={value}
      rows={minRows}
      onChange={(e) => onValueChange(e.target.value)}
      spellCheck={mono ? false : undefined}
      className={cn(
        "block w-full resize-none rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-xs transition-[color,box-shadow] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:bg-input/30",
        mono && "bg-[var(--code-bg)] font-mono text-[0.8rem] leading-6 dark:bg-[var(--code-bg)]",
        className,
      )}
      {...props}
    />
  );
}
