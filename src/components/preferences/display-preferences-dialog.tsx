"use client";

import { RotateCcw, TriangleAlert, Type } from "lucide-react";
import { type ReactNode, type RefObject, useId, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { NativeSelect } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { timerThresholdsText } from "@/lib/a11y/timer-announcements";
import {
  CODE_FONT_SIZE_LABELS,
  CODE_FONT_SIZES,
  DEFAULT_PREFERENCES,
  isDefaultPreferences,
  REDUCE_MOTION_LABELS,
  REDUCE_MOTION_OPTIONS,
  type ReduceMotion,
  TEXT_SIZE_LABELS,
  TEXT_SIZES,
  type UserPreferences,
} from "@/lib/preferences";
import { cn } from "@/lib/utils";
import { PREFERENCES_SAVE_ERROR } from "./preferences-store";
import { usePreferences } from "./use-preferences";

/* ------------------------------------------------------------------ */
/* Building blocks                                                     */
/* ------------------------------------------------------------------ */

/** Native radio group styled as a segmented control (arrow keys for free). */
function SegmentedRadio<T extends string>({
  legend,
  name,
  value,
  options,
  onChange,
  columns,
}: {
  legend: string;
  name: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  columns: string;
}) {
  return (
    <fieldset className="flex min-w-0 flex-col gap-2">
      <legend className="mb-2 text-sm font-medium text-foreground">
        {legend}
      </legend>
      <div
        className={cn("grid gap-1 rounded-lg border bg-muted/50 p-1", columns)}
      >
        {options.map((option) => {
          const checked = option.value === value;
          return (
            <label
              key={option.value}
              className={cn(
                "relative flex min-h-9 cursor-pointer items-center justify-center rounded-md px-2 py-1.5 text-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground",
                "has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                checked &&
                  "bg-background text-foreground shadow-xs ring-1 ring-border",
              )}
            >
              <input
                type="radio"
                name={name}
                value={option.value}
                checked={checked}
                onChange={() => onChange(option.value)}
                className="sr-only"
              />
              {option.label}
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

function SwitchRow({
  label,
  help,
  checked,
  onChange,
}: {
  label: string;
  help?: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  const id = useId();
  const helpId = useId();
  return (
    <div className="flex items-start justify-between gap-4 py-3">
      <div className="flex min-w-0 flex-col gap-0.5">
        <label htmlFor={id} className="text-sm font-medium text-foreground">
          {label}
        </label>
        {help ? (
          <p
            id={helpId}
            className="text-xs leading-relaxed text-muted-foreground"
          >
            {help}
          </p>
        ) : null}
      </div>
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        aria-describedby={help ? helpId : undefined}
        className="mt-0.5"
      />
    </div>
  );
}

function Preview() {
  return (
    <figure className="flex flex-col gap-2 rounded-lg border bg-card p-3.5">
      <figcaption className="text-sm font-medium text-muted-foreground">
        Voorbeeld
      </figcaption>
      <p className="text-sm leading-relaxed text-foreground">
        Schrijf een programma dat om je naam vraagt en je daarna begroet. Let op
        het verschil tussen l, I en 1, en tussen O en 0.
      </p>
      <pre
        translate="no"
        className="overflow-x-auto rounded-md border bg-[var(--code-bg)] px-3 py-2 font-mono leading-relaxed text-[var(--code-fg)]"
        style={{ fontSize: "var(--code-font-size, 0.875rem)" }}
      >
        <code>
          <span className="text-[var(--code-function)]">print</span>
          <span className="text-[var(--code-punctuation)]">(</span>
          <span className="text-[var(--code-string)]">"Hallo wereld!"</span>
          <span className="text-[var(--code-punctuation)]">)</span>
        </code>
      </pre>
    </figure>
  );
}

/* ------------------------------------------------------------------ */
/* Dialog                                                              */
/* ------------------------------------------------------------------ */

export interface DisplayPreferencesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Focus this element on close (e.g. the trigger of the menu the dialog was
   * opened from). Without it focus goes back to the element that opened the
   * dialog (DialogContent).
   */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

/**
 * "Weergave en leesbaarheid": text size, code font size, readable font,
 * spacing, contrast, motion and the exam timer. Changes apply immediately
 * and are saved to the account (usePreferences).
 */
export function DisplayPreferencesDialog({
  open,
  onOpenChange,
  returnFocusRef,
}: DisplayPreferencesDialogProps) {
  const { prefs, update, saveFailed } = usePreferences();
  const motionId = useId();
  const motionHelpId = useId();
  const groupName = useId();

  function set<K extends keyof UserPreferences>(
    key: K,
    value: UserPreferences[K],
  ) {
    update({ [key]: value } as Partial<UserPreferences>);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        onCloseAutoFocus={(e) => {
          const target = returnFocusRef?.current;
          if (target?.isConnected) {
            e.preventDefault();
            target.focus();
          }
        }}
        className="max-h-[calc(100dvh-2rem)] gap-5 overflow-y-auto sm:max-w-lg"
      >
        <DialogHeader>
          <DialogTitle>Weergave en leesbaarheid</DialogTitle>
          <DialogDescription>
            Deze instellingen gelden alleen voor jou en worden bij je account
            bewaard, dus ook op andere computers op school.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          <SegmentedRadio
            legend="Tekstgrootte"
            name={`${groupName}-text`}
            value={prefs.textSize}
            options={TEXT_SIZES.map((v) => ({
              value: v,
              label: TEXT_SIZE_LABELS[v],
            }))}
            onChange={(v) => set("textSize", v)}
            columns="grid-cols-3"
          />
          <SegmentedRadio
            legend="Lettergrootte in de code-editor"
            name={`${groupName}-code`}
            value={prefs.codeFontSize}
            options={CODE_FONT_SIZES.map((v) => ({
              value: v,
              label: CODE_FONT_SIZE_LABELS[v],
            }))}
            onChange={(v) => set("codeFontSize", v)}
            columns="grid-cols-2 sm:grid-cols-4"
          />

          <div className="flex flex-col divide-y border-y">
            <SwitchRow
              label="Goed leesbaar lettertype"
              help="Letters die je minder snel door elkaar haalt, zoals l, I en 1. Fijn bij dyslexie."
              checked={prefs.readableFont}
              onChange={(v) => set("readableFont", v)}
            />
            <SwitchRow
              label="Ruimere regelafstand"
              help="Meer ruimte tussen regels, woorden en letters."
              checked={prefs.wideSpacing}
              onChange={(v) => set("wideSpacing", v)}
            />
            <SwitchRow
              label="Extra contrast"
              help="Grijze tekst, randen en code worden donkerder (of lichter in het donkere thema)."
              checked={prefs.moreContrast}
              onChange={(v) => set("moreContrast", v)}
            />
            <div className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
              <div className="flex flex-col gap-0.5">
                <label
                  htmlFor={motionId}
                  className="text-sm font-medium text-foreground"
                >
                  Bewegingen
                </label>
                <p
                  id={motionHelpId}
                  className="text-xs leading-relaxed text-muted-foreground"
                >
                  Bij minder beweging staan animaties en overgangen uit.
                </p>
              </div>
              <NativeSelect
                id={motionId}
                aria-describedby={motionHelpId}
                value={prefs.reduceMotion}
                onChange={(e) =>
                  set("reduceMotion", e.target.value as ReduceMotion)
                }
                options={REDUCE_MOTION_OPTIONS.map((v) => ({
                  value: v,
                  label: REDUCE_MOTION_LABELS[v],
                }))}
                className="sm:w-56"
              />
            </div>
            <SwitchRow
              label="Timer tonen tijdens toetsen"
              help={`Je krijgt nog steeds een melding bij ${timerThresholdsText()}.`}
              checked={prefs.showTimer}
              onChange={(v) => set("showTimer", v)}
            />
          </div>

          <Preview />

          {saveFailed ? (
            // Also a toast, but that can't be reached by keyboard while this
            // dialog keeps focus inside it.
            <p
              role="alert"
              className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive-ink"
            >
              <TriangleAlert
                className="mt-0.5 size-4 shrink-0"
                aria-hidden="true"
              />
              {PREFERENCES_SAVE_ERROR}
            </p>
          ) : null}
        </div>

        <DialogFooter className="gap-2 sm:justify-between">
          <Button
            variant="outline"
            disabled={isDefaultPreferences(prefs)}
            onClick={() => update({ ...DEFAULT_PREFERENCES })}
          >
            <RotateCcw aria-hidden="true" />
            Standaard herstellen
          </Button>
          <Button onClick={() => onOpenChange(false)}>Klaar</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ------------------------------------------------------------------ */
/* Button                                                              */
/* ------------------------------------------------------------------ */

export interface DisplayPreferencesButtonProps {
  /**
   * `icon` (default): a compact "Aa" button for toolbars (exam header).
   * `menu`: a full-width row with icon and label.
   */
  variant?: "icon" | "menu";
  className?: string;
}

/** Opens the "Weergave en leesbaarheid" dialog. */
export function DisplayPreferencesButton({
  variant = "icon",
  className,
}: DisplayPreferencesButtonProps) {
  const [open, setOpen] = useState(false);

  const button =
    variant === "icon" ? (
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Weergave aanpassen"
            aria-haspopup="dialog"
            onClick={() => setOpen(true)}
            className={cn(
              "font-semibold text-muted-foreground hover:text-foreground",
              className,
            )}
          >
            <span aria-hidden="true" className="text-[0.95rem] leading-none">
              Aa
            </span>
          </Button>
        </TooltipTrigger>
        <TooltipContent>Weergave aanpassen</TooltipContent>
      </Tooltip>
    ) : (
      <Button
        variant="ghost"
        aria-haspopup="dialog"
        onClick={() => setOpen(true)}
        className={cn("w-full justify-start gap-2 px-2", className)}
      >
        <Type className="text-muted-foreground" aria-hidden="true" />
        Weergave en leesbaarheid
      </Button>
    );

  return (
    <>
      {button}
      <DisplayPreferencesDialog open={open} onOpenChange={setOpen} />
    </>
  );
}
