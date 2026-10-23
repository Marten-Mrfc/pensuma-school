"use client";

import { Loader2, TriangleAlert } from "lucide-react";
import { type ReactNode, type RefObject, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getErrorMessage } from "./get-error-message";

export interface ConfirmDialogProps {
  /** Element that opens the dialog (rendered with asChild, e.g. a <Button>). */
  trigger?: ReactNode;
  /** Controlled open state (use with onOpenChange when there is no trigger). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  title: ReactNode;
  description?: ReactNode;
  /** Default "Bevestigen" (or "Verwijderen" when destructive). */
  confirmLabel?: string;
  /** Default "Annuleren". */
  cancelLabel?: string;
  /** Red confirm button and a warning icon (the only dialogs with an icon). */
  destructive?: boolean;
  /**
   * Runs on confirm. While the promise is pending the buttons are disabled.
   * Resolve to close the dialog; throw to keep it open and show the error.
   */
  onConfirm: () => Promise<void> | void;
  /** Extra content between the description and the buttons. */
  children?: ReactNode;
  /**
   * Where focus goes after closing when the element that opened the dialog
   * no longer exists (e.g. the row that was just deleted), instead of the
   * page body.
   */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

/** "Weet je het zeker?" dialog with async confirm handling. */
export function ConfirmDialog({
  trigger,
  open: openProp,
  onOpenChange,
  title,
  description,
  confirmLabel,
  cancelLabel = "Annuleren",
  destructive = false,
  onConfirm,
  children,
  returnFocusRef,
}: ConfirmDialogProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = openProp ?? internalOpen;

  function setOpen(next: boolean) {
    if (!next && pending) return;
    if (next) setError(null);
    if (openProp === undefined) setInternalOpen(next);
    onOpenChange?.(next);
  }

  async function handleConfirm() {
    setPending(true);
    setError(null);
    try {
      await onConfirm();
      setPending(false);
      if (openProp === undefined) setInternalOpen(false);
      onOpenChange?.(false);
    } catch (e) {
      setPending(false);
      setError(getErrorMessage(e));
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      {trigger ? <DialogTrigger asChild>{trigger}</DialogTrigger> : null}
      <DialogContent
        role="alertdialog"
        showCloseButton={false}
        className="gap-5 sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
        // Focus goes back to the element that opened the dialog (also
        // without a trigger, see DialogContent), or to returnFocusRef when
        // that element is gone.
        returnFocusFallbackRef={returnFocusRef}
      >
        <div className="flex gap-4">
          {destructive ? (
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive">
              <TriangleAlert className="size-5" aria-hidden="true" />
            </span>
          ) : null}
          <div
            className={cn(
              "flex min-w-0 flex-col gap-1.5",
              destructive && "pt-1",
            )}
          >
            <DialogTitle className="text-base leading-snug font-semibold">
              {title}
            </DialogTitle>
            {description ? (
              <DialogDescription className="text-sm leading-relaxed text-muted-foreground">
                {description}
              </DialogDescription>
            ) : (
              <DialogDescription className="sr-only">
                Bevestig deze actie.
              </DialogDescription>
            )}
          </div>
        </div>

        {children ? <div className="text-sm">{children}</div> : null}

        {error ? (
          <p
            role="alert"
            className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive-ink"
          >
            {error}
          </p>
        ) : null}

        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button
            variant="outline"
            disabled={pending}
            onClick={() => setOpen(false)}
          >
            {cancelLabel}
          </Button>
          <Button
            variant={destructive ? "destructive" : "default"}
            disabled={pending}
            aria-busy={pending}
            onClick={handleConfirm}
          >
            {pending ? (
              <Loader2
                className="motion-safe:animate-spin"
                aria-hidden="true"
              />
            ) : null}
            {confirmLabel ?? (destructive ? "Verwijderen" : "Bevestigen")}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
