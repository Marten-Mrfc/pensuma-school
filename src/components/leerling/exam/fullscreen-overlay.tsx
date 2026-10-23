"use client";

import { Maximize } from "lucide-react";
import { useId } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * No "druk op F11": the browser's own full screen (F11) does not count as
 * full screen for the page, so the overlay would stay.
 */
export const FULLSCREEN_FAILED =
  "Volledig scherm lukte niet. Probeer het nog een keer of vraag je docent om hulp.";

/**
 * "Ga terug naar volledig scherm" (afnames that require fullscreen). Modal
 * with a focus trap: everything outside it, toasts included, is hidden from
 * keyboard and screen-reader users, so a failure is shown inside it.
 */
export function FullscreenOverlay({
  open,
  error,
  onEnter,
  onHandIn,
}: {
  open: boolean;
  /** Why entering fullscreen failed; shown under the button. */
  error: string | null;
  onEnter: () => void;
  onHandIn: () => void;
}) {
  return (
    <Dialog open={open}>
      <DialogContent
        role="alertdialog"
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => {
          // Focus goes back to where the student was (see enterFullscreen),
          // or into the hand-in dialog.
          e.preventDefault();
        }}
        className="flex max-w-md flex-col items-center gap-4 p-8 text-center"
      >
        <span className="grid size-14 place-items-center rounded-2xl bg-warning/15 text-warning-ink">
          <Maximize className="size-7" aria-hidden="true" />
        </span>
        <DialogTitle className="font-display text-2xl leading-tight font-bold tracking-tight">
          Ga terug naar volledig scherm om verder te gaan
        </DialogTitle>
        <DialogDescription className="text-muted-foreground">
          Deze toets werkt alleen in volledig scherm. Het verlaten ervan wordt
          bijgehouden. Je antwoorden zijn veilig opgeslagen.
        </DialogDescription>
        <FullscreenActions
          error={error}
          onEnter={onEnter}
          onHandIn={onHandIn}
        />
      </DialogContent>
    </Dialog>
  );
}

/** The two buttons, with the error (role="alert") right under the first. */
export function FullscreenActions({
  error,
  onEnter,
  onHandIn,
}: {
  error: string | null;
  onEnter: () => void;
  onHandIn: () => void;
}) {
  const errorId = useId();
  return (
    <>
      <Button
        size="lg"
        className="h-12 px-6 text-base"
        onClick={onEnter}
        aria-describedby={error ? errorId : undefined}
        autoFocus
      >
        <Maximize aria-hidden="true" />
        Volledig scherm
      </Button>
      {error ? (
        <p
          id={errorId}
          role="alert"
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive-ink"
        >
          {error}
        </p>
      ) : null}
      <Button
        variant="link"
        className="text-muted-foreground"
        onClick={onHandIn}
      >
        Ik ben klaar en wil inleveren
      </Button>
    </>
  );
}
