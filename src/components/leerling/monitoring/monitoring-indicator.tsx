"use client";

import { Eye } from "lucide-react";
import { useState } from "react";
import { badgeVariants } from "@/components/ui/badge";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const EXPLANATION = "Je docent kan zien wanneer je het toetsvenster verlaat.";

/**
 * "Logboek aan" badge in the exam header while focus or fullscreen events
 * are logged. It is a button so keyboard and touch users can reach the
 * explanation too (focus or tap shows the tooltip).
 */
export function MonitoringIndicator({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false);
  if (!active) return null;
  return (
    <Tooltip open={open} onOpenChange={setOpen}>
      <TooltipTrigger
        type="button"
        aria-label={`Logboek aan. ${EXPLANATION}`}
        onClick={(event) => {
          // Taps toggle the tooltip (Radix would close it on click).
          event.preventDefault();
          setOpen((value) => !value);
        }}
        className={cn(
          badgeVariants({ variant: "info" }),
          "h-7 cursor-default gap-1.5 px-2.5 outline-none focus-visible:ring-[3px] focus-visible:ring-ring",
        )}
      >
        <Eye aria-hidden="true" className="size-3.5" />
        <span className="max-sm:sr-only" aria-hidden="true">
          Logboek aan
        </span>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-64">
        {EXPLANATION}
      </TooltipContent>
    </Tooltip>
  );
}
