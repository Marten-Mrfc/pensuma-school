"use client";

import { ArrowRight } from "lucide-react";
import Link from "next/link";
import { type RefObject, useId, useSyncExternalStore } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import {
  setShortcutsEnabled,
  shortcutsByScope,
  shortcutsEnabled,
  subscribeShortcutsEnabled,
} from "@/lib/a11y/shortcuts";
import { routes } from "@/lib/routes";
import { KeyCombo } from "./key-combo";

export interface ShortcutsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Focus this element on close (e.g. a menu trigger) instead of the default. */
  returnFocusRef?: RefObject<HTMLElement | null>;
}

/** Overview of every keyboard shortcut, with a switch to turn them off. */
export function ShortcutsDialog({
  open,
  onOpenChange,
  returnFocusRef,
}: ShortcutsDialogProps) {
  const switchId = useId();
  const switchHelpId = useId();
  const enabled = useSyncExternalStore(
    subscribeShortcutsEnabled,
    shortcutsEnabled,
    () => true,
  );

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
          <DialogTitle>Sneltoetsen</DialogTitle>
          <DialogDescription>
            Pensuma gebruikt geen sneltoetsen van één letter. In de code-editor
            werken de editortoetsen altijd.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-5">
          {shortcutsByScope().map((group) => (
            <section key={group.scope} className="flex flex-col gap-2">
              <h3 className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                {group.scope}
              </h3>
              <dl className="divide-y rounded-lg border">
                {group.items.map((item) => (
                  <div
                    key={item.id}
                    className="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between sm:gap-4"
                  >
                    <dt className="shrink-0">
                      <KeyCombo keys={item.keys} />
                      {item.macKeys ? (
                        <span className="ml-1.5 text-xs text-muted-foreground">
                          (Mac: {item.macKeys})
                        </span>
                      ) : null}
                    </dt>
                    <dd className="text-sm text-foreground sm:text-right">
                      {item.description}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>

        <div className="flex items-start justify-between gap-4 rounded-lg border bg-muted/40 px-3.5 py-3">
          <div className="flex flex-col gap-0.5">
            <label htmlFor={switchId} className="text-sm font-medium">
              Sneltoetsen gebruiken
            </label>
            <p id={switchHelpId} className="text-xs text-muted-foreground">
              Zet dit uit als sneltoetsen botsen met je hulpmiddelen. Geldt
              alleen op deze computer.
            </p>
          </div>
          <Switch
            id={switchId}
            aria-describedby={switchHelpId}
            checked={enabled}
            onCheckedChange={setShortcutsEnabled}
            className="mt-0.5"
          />
        </div>

        <DialogFooter className="items-center gap-3 sm:justify-between">
          <Link
            href={routes.accessibility}
            onClick={() => onOpenChange(false)}
            className="inline-flex items-center gap-1 rounded-sm text-sm font-medium text-primary underline-offset-4 outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            Meer over toegankelijkheid
            <ArrowRight className="size-3.5" aria-hidden="true" />
          </Link>
          <DialogClose asChild>
            <Button>Sluiten</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
