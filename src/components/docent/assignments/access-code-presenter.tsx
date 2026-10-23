"use client";

import { KeyRound, Minimize2, Users, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { routes } from "@/lib/routes";
import { useDialogReturnFocus } from "./use-dialog-return-focus";

/**
 * Full-screen "projector" view of the access code: huge monospace letters,
 * the login URL and a live count of students who started. Esc closes.
 *
 * Built on the Radix dialog, also when the browser refuses fullscreen:
 * Tab stays inside the view, the page behind it is hidden from assistive
 * technology, and closing returns focus to the button that opened it (or,
 * from the "Meer acties" menu, to the menu button) (WCAG 2.4.3, 2.4.11).
 */
export function AccessCodePresenter({
  code,
  title,
  className,
  started,
  students,
  onClose,
}: {
  code: string;
  title: string;
  className: string;
  started: number;
  students: number;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const returnFocus = useDialogReturnFocus();

  useEffect(() => {
    const el = ref.current;
    // Ask for real fullscreen; fine if the browser refuses.
    el?.requestFullscreen?.().catch(() => {});
    const onFullscreenChange = () => {
      if (!document.fullscreenElement) onClose();
    };
    const timer = setTimeout(
      () => document.addEventListener("fullscreenchange", onFullscreenChange),
      300,
    );
    return () => {
      clearTimeout(timer);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [onClose]);

  const loginUrl = `${window.location.host}${routes.login}`;

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        ref={ref}
        showCloseButton={false}
        {...returnFocus}
        className="inset-0 top-0 left-0 z-[100] flex h-dvh w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none border-0 bg-background p-0 text-foreground shadow-none outline-none data-[state=closed]:zoom-out-100 data-[state=open]:zoom-in-100 sm:max-w-none"
      >
        <div className="flex items-center justify-between gap-4 px-6 py-5 sm:px-10">
          <Logo href={null} />
          <div className="flex items-center gap-2">
            <span className="hidden items-center gap-2 rounded-full bg-muted px-3 py-1.5 text-sm font-medium text-muted-foreground tabular-nums sm:inline-flex">
              <Users className="size-4" aria-hidden="true" />
              {started} van {students} begonnen
            </span>
            <Button
              variant="outline"
              size="icon"
              onClick={onClose}
              aria-label="Sluiten (Esc)"
            >
              {document.fullscreenElement ? (
                <Minimize2 aria-hidden="true" />
              ) : (
                <X aria-hidden="true" />
              )}
            </Button>
          </div>
        </div>

        <div className="flex flex-1 flex-col items-center justify-center gap-[4vh] px-6 text-center">
          <div className="flex flex-col items-center gap-2">
            <DialogTitle className="text-[clamp(1.25rem,2.6vw,2.25rem)] font-semibold text-balance">
              {title}
            </DialogTitle>
            <p className="text-[clamp(1rem,1.6vw,1.5rem)] text-muted-foreground">
              {className}
            </p>
          </div>

          <div className="flex flex-col items-center gap-[2vh]">
            {/* Read once, letter by letter, as the dialog's description. */}
            <DialogDescription className="sr-only">
              Toegangscode: {code.split("").join(" ")}
            </DialogDescription>
            <span
              aria-hidden="true"
              className="inline-flex items-center gap-2 text-[clamp(0.9rem,1.4vw,1.25rem)] font-semibold tracking-[0.2em] text-primary uppercase"
            >
              <KeyRound className="size-[1.2em]" />
              Toegangscode
            </span>
            <p
              aria-hidden="true"
              style={{
                fontSize: `clamp(3rem, ${Math.floor(80 / Math.max(code.length, 5))}vw, 15rem)`,
              }}
              className="rounded-3xl border-2 border-primary/30 bg-primary/[0.06] px-[4vw] py-[2vh] font-mono leading-none font-bold tracking-[0.12em] text-foreground tabular-nums select-all"
            >
              {code}
            </p>
          </div>

          <div className="flex flex-col items-center gap-1">
            <p className="text-[clamp(1rem,1.8vw,1.75rem)] text-muted-foreground">
              Ga naar{" "}
              <span className="font-mono font-semibold text-foreground">
                {loginUrl}
              </span>
            </p>
            <p className="text-[clamp(0.9rem,1.4vw,1.35rem)] text-muted-foreground">
              Log in met je leerlingnummer en pincode, kies de toets en typ deze
              code.
            </p>
          </div>
        </div>

        <p className="pb-5 text-center text-xs text-muted-foreground">
          Druk op Esc om terug te gaan
        </p>
      </DialogContent>
    </Dialog>
  );
}
