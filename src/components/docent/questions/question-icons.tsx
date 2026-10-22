import {
  Calculator,
  CircleDot,
  Keyboard,
  ListChecks,
  type LucideIcon,
  MessageSquareText,
  Printer,
  SquareCode,
  SquareFunction,
} from "lucide-react";
import type { QuestionType } from "@/lib/questions/schema";
import type { QuestionTemplateIcon } from "@/lib/questions/templates";

export const TEMPLATE_ICONS: Record<QuestionTemplateIcon, LucideIcon> = {
  SquareCode,
  Printer,
  Keyboard,
  Calculator,
  SquareFunction,
  CircleDot,
  ListChecks,
  MessageSquareText,
};

export const QUESTION_TYPE_ICONS: Record<QuestionType, LucideIcon> = {
  code: SquareCode,
  multiple_choice: ListChecks,
  open: MessageSquareText,
};

/** Accent classes per question type (theme tokens only). */
export const QUESTION_TYPE_TONE: Record<QuestionType, string> = {
  code: "bg-primary/10 text-primary",
  multiple_choice: "bg-info/10 text-info-ink",
  open: "bg-warning/12 text-warning-ink",
};
