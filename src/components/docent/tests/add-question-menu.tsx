"use client";

import { Loader2, Plus } from "lucide-react";
import type { ReactNode } from "react";
import {
  QUESTION_TYPE_ICONS,
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

const GROUPS: { type: QuestionType; label: string }[] = [
  { type: "code", label: "Programmeren" },
  { type: "multiple_choice", label: "Meerkeuze" },
  { type: "open", label: "Open" },
];

export function AddQuestionMenu({
  onAdd,
  disabled,
  pending,
  trigger,
  variant = "default",
  size = "sm",
  className,
  align = "start",
}: {
  onAdd: (template: QuestionTemplate) => void;
  disabled?: boolean;
  pending?: boolean;
  trigger?: ReactNode;
  variant?: ButtonProps["variant"];
  size?: ButtonProps["size"];
  className?: string;
  align?: "start" | "end" | "center";
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled || pending}>
        {trigger ?? (
          <Button
            variant={variant}
            size={size}
            className={className}
            disabled={disabled || pending}
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
        className="w-[min(22rem,calc(100vw-2rem))] p-1.5"
      >
        {GROUPS.map((group, gi) => {
          const GroupIcon = QUESTION_TYPE_ICONS[group.type];
          return (
            <DropdownMenuGroup key={group.type}>
              {gi > 0 ? <DropdownMenuSeparator /> : null}
              <DropdownMenuLabel className="flex items-center gap-1.5 text-[0.7rem] font-semibold tracking-wide text-muted-foreground uppercase">
                <GroupIcon className="size-3.5" aria-hidden="true" />
                {group.label}
              </DropdownMenuLabel>
              {QUESTION_TEMPLATES.filter((t) => t.type === group.type).map(
                (template) => {
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
                          group.type === "code"
                            ? "bg-primary/10 text-primary"
                            : group.type === "multiple_choice"
                              ? "bg-info/10 text-info-ink"
                              : "bg-warning/12 text-warning-ink",
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
                },
              )}
            </DropdownMenuGroup>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
