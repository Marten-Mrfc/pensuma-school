import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Same bounds as the server (assignment.extendTime / reopenAttempt). */
export const MIN_EXTRA_MINUTES = 1;
export const MAX_EXTRA_MINUTES = 600;

export const MINUTES_HINT = `${MIN_EXTRA_MINUTES} tot en met ${MAX_EXTRA_MINUTES} minuten.`;
export const MINUTES_ERROR = `Kies ${MIN_EXTRA_MINUTES} tot en met ${MAX_EXTRA_MINUTES} minuten.`;

const PRESETS = [5, 10, 15, 30];

/** Whole minutes from the field, or null when outside 1–600 (or empty). */
export function parseExtraMinutes(value: string): number | null {
  const trimmed = value.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const minutes = Number.parseInt(trimmed, 10);
  return minutes >= MIN_EXTRA_MINUTES && minutes <= MAX_EXTRA_MINUTES
    ? minutes
    : null;
}

/**
 * "Minuten" input with preset chips for the monitor's "Tijd verlengen" and
 * "Poging heropenen" dialogs. The allowed range is always shown (WCAG
 * 3.3.2); after a submit with an invalid value (`showError`), the field is
 * marked invalid and says what to fix (WCAG 3.3.1), instead of the submit
 * button silently staying disabled.
 */
export function MinutesField({
  id,
  value,
  onChange,
  showError,
}: {
  id: string;
  value: string;
  onChange: (value: string) => void;
  showError: boolean;
}) {
  const inputId = `${id}-minutes`;
  const hintId = `${id}-minutes-hint`;
  const errorId = `${id}-minutes-error`;
  const minutes = parseExtraMinutes(value);
  const invalid = showError && minutes === null;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={inputId} className="text-sm font-medium">
        Minuten
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <div className="w-28">
          <Input
            id={inputId}
            type="number"
            inputMode="numeric"
            min={MIN_EXTRA_MINUTES}
            max={MAX_EXTRA_MINUTES}
            autoFocus
            value={value}
            onChange={(e) => onChange(e.target.value)}
            aria-invalid={invalid || undefined}
            aria-describedby={invalid ? `${errorId} ${hintId}` : hintId}
          />
        </div>
        {PRESETS.map((m) => (
          <button
            key={m}
            type="button"
            aria-pressed={minutes === m}
            onClick={() => onChange(String(m))}
            className={cn(
              "h-7 rounded-full border px-2.5 text-xs font-medium tabular-nums outline-none hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring",
              minutes === m && "border-primary bg-primary/10 text-primary",
            )}
          >
            {m} min
          </button>
        ))}
      </div>
      {invalid ? (
        <p id={errorId} className="text-sm font-medium text-destructive-ink">
          {MINUTES_ERROR}
        </p>
      ) : null}
      <p id={hintId} className="text-xs text-muted-foreground">
        {MINUTES_HINT}
      </p>
    </div>
  );
}
