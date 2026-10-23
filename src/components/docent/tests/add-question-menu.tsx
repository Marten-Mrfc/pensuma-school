"use client";

import { Library, Loader2, Plus } from "lucide-react";
import { type ReactNode, useState } from "react";
import {
  QUESTION_TYPE_TONE,
  TEMPLATE_ICONS,
} from "@/components/docent/questions/question-icons";
import { Button, type ButtonProps } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { QuestionType } from "@/lib/questions/schema";
import {
  QUESTION_TEMPLATES,
  type QuestionTemplate,
} from "@/lib/questions/templates";
import { cn } from "@/lib/utils";

/**
 * Whether focus already moved on to the page while the menu was closing:
 * the new question's Titel field (the server answered before the close
 * animation ended) or a dialog an item opened. The menu must then leave it
 * there instead of moving it back to its trigger (WCAG 2.4.3). `menu` is
 * the menu content (detached by the time the menu has closed).
 */
export function focusMovedOutOfMenu(
  active: Element | null,
  body: Element | null,
  menu: EventTarget | null,
): boolean {
  if (!active || active === body || !active.isConnected) return false;
  const container = menu as Partial<Pick<Element, "contains">> | null;
  return !(
    typeof container?.contains === "function" && container.contains(active)
  );
}

const GROUPS: { type: QuestionType; label: string }[] = [
  { type: "code", label: "Programmeren" },
  { type: "multiple_choice", label: "Meerkeuze" },
  { type: "open", label: "Open" },
];

export function AddQuestionMenu({
  onAdd,
  onOpenBank,
  disabled,
  pending,
  trigger,
  variant = "default",
  size = "sm",
  className,
  align = "start",
}: {
  onAdd: (template: QuestionTemplate) => void;
  /** "Uit vragenbank…": copy existing questions (opens a dialog). */
  onOpenBank?: () => void;
  disabled?: boolean;
  pending?: boolean;
  trigger?: ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  align?: "start" | "end" | "center";
}) {
  const [open, setOpen] = useState(false);
  // While a question is being created the trigger stays focusable
  // (aria-disabled, the menu just doesn't open): a disabled button would
  // drop keyboard focus to <body> (WCAG 2.4.3).
  const blocked = Boolean(disabled || pending);
  return (
    <DropdownMenu
      open={open && !blocked}
      onOpenChange={(next) => setOpen(next && !blocked)}
    >
      <DropdownMenuTrigger asChild disabled={disabled}>
        {trigger ?? (
          <Button
            variant={variant}
            size={size}
            className={className}
            disabled={disabled}
            aria-disabled={pending || undefined}
            aria-busy={pending || undefined}
          >
            {pending ? (
              <Loader2
                className="motion-safe:animate-spin"
                aria-hidden="true"
              />
            ) : (
              <Plus aria-hidden="true" />
            )}
            Vraag toevoegen
          </Button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align={align}
        collisionPadding={12}
        onCloseAutoFocus={(event) => {
          if (
            focusMovedOutOfMenu(
              document.activeElement,
              document.body,
              event.target,
            )
          ) {
            event.preventDefault();
          }
        }}
        className="max-h-[var(--radix-dropdown-menu-content-available-height)] w-[min(40rem,calc(100vw-1.5rem))] overflow-y-auto p-1.5"
      >
        <div className="grid md:grid-cols-2 md:gap-x-1">
          {[GROUPS.slice(0, 1), GROUPS.slice(1)].map((column, ci) => (
            <div key={column[0].type} className="flex flex-col">
              {column.map((group, gi) => {
                return (
                  <DropdownMenuGroup key={group.type}>
                    {gi > 0 || (ci > 0 && gi === 0) ? (
                      <DropdownMenuSeparator
                        className={gi === 0 ? "md:hidden" : undefined}
                      />
                    ) : null}
                    <DropdownMenuLabel className="text-xs font-medium text-muted-foreground">
                      {group.label}
                    </DropdownMenuLabel>
                    {QUESTION_TEMPLATES.filter(
                      (t) => t.type === group.type,
                    ).map((template) => {
                      const Icon = TEMPLATE_ICONS[template.icon];
                      return (
                        <DropdownMenuItem
                          key={template.id}
                          onSelect={() => onAdd(template)}
                          className="items-start gap-3 py-2"
                        >
                          <span
                            className={cn(
                              "mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg",
                              QUESTION_TYPE_TONE[group.type],
                            )}
                          >
                            <Icon className="size-4" aria-hidden="true" />
                          </span>
                          <span className="flex min-w-0 flex-col gap-0.5">
                            <span className="text-sm font-medium">
                              {template.label}
                            </span>
                            <span className="text-xs leading-snug whitespace-normal text-muted-foreground">
                              {template.description}
                            </span>
                          </span>
                        </DropdownMenuItem>
                      );
                    })}
                  </DropdownMenuGroup>
                );
              })}
            </div>
          ))}
        </div>
        {onOpenBank ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={onOpenBank}
              className="items-start gap-3 py-2"
            >
              <span className="mt-0.5 grid size-8 shrink-0 place-items-center rounded-lg bg-secondary text-secondary-foreground">
                <Library className="size-4" aria-hidden="true" />
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium">Uit vragenbank…</span>
                <span className="text-xs leading-snug whitespace-normal text-muted-foreground">
                  Hergebruik vragen uit je andere toetsen, gezocht op onderwerp
                  of tekst.
                </span>
              </span>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
