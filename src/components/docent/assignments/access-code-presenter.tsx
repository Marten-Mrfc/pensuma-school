"use client";

import { KeyRound, Minimize2, Users, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Logo } from "@/components/app/logo";
import { Button } from "@/components/ui/button";
import { routes } from "@/lib/routes";

/**
 * Full-screen "projector" view of the access code: huge monospace letters,
 * the login URL and a live count of students who started. Esc closes.
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

  useEffect(() => {
    const el = ref.current;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    el?.focus();
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
      window.removeEventListener("keydown", onKey);
      clearTimeout(timer);
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    };
  }, [onClose]);

  const loginUrl = `${window.location.host}${routes.login}`;

  return createPortal(
    <div
      ref={ref}
      role="dialog"
      aria-modal="true"
      aria-label="Toegangscode"
      tabIndex={-1}
      className="fixed inset-0 z-[100] flex flex-col bg-background text-foreground outline-none"
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
          <p className="text-[clamp(1.25rem,2.6vw,2.25rem)] font-semibold text-balance">
            {title}
          </p>
          <p className="text-[clamp(1rem,1.6vw,1.5rem)] text-muted-foreground">
            {className}
          </p>
        </div>

        <div className="flex flex-col items-center gap-[2vh]">
          <span className="inline-flex items-center gap-2 text-[clamp(0.9rem,1.4vw,1.25rem)] font-semibold tracking-[0.2em] text-primary uppercase">
            <KeyRound className="size-[1.2em]" aria-hidden="true" />
            Toegangscode
          </span>
          <p
            style={{
              fontSize: `clamp(3rem, ${Math.floor(80 / Math.max(code.length, 5))}vw, 15rem)`,
            }}
            className="rounded-3xl border-2 border-primary/30 bg-primary/[0.06] px-[4vw] py-[2vh] font-mono leading-none font-bold tracking-[0.12em] text-foreground tabular-nums select-all"
          >
            <span aria-hidden="true">{code}</span>
            <span className="sr-only">{code.split("").join(" ")}</span>
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
    </div>,
    document.body,
  );
}
