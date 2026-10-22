"use client";

import { useQuery } from "@tanstack/react-query";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { useState } from "react";
import { CopyButton } from "@/components/app/copy-button";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";
import { formatPin } from "./format";

export interface PinRevealProps {
  userId: string;
  /** False when no (encrypted) PIN is stored for this student. */
  hasPin: boolean;
  /** `lg` shows the PIN in a large mono font (student detail page). */
  size?: "sm" | "lg";
  className?: string;
}

/** Masked PIN ("••• •••") that is fetched and shown on click, with a copy button. */
export function PinReveal({ userId, hasPin, size = "sm", className }: PinRevealProps) {
  const trpc = useTRPC();
  const [shown, setShown] = useState(false);
  const { data, isFetching, isError } = useQuery({
    ...trpc.student.getPins.queryOptions({ userIds: [userId] }),
    enabled: shown && hasPin,
    staleTime: 60_000,
  });
  const pin = data?.[0]?.pin ?? null;

  if (!hasPin) {
    return (
      <span className={cn("text-xs text-muted-foreground", className)}>
        Onbekend, reset de pincode
      </span>
    );
  }

  const large = size === "lg";
  const text = shown && pin ? formatPin(pin) : "••• •••";

  return (
    <span className={cn("inline-flex items-center gap-1", className)}>
      <span
        className={cn(
          "font-mono tabular-nums select-all",
          large ? "text-3xl font-medium tracking-[0.18em]" : "text-sm tracking-[0.14em]",
          !(shown && pin) && "text-muted-foreground",
        )}
        aria-label={shown && pin ? `Pincode ${pin.split("").join(" ")}` : "Pincode verborgen"}
      >
        {shown && isError ? "fout" : text}
      </span>
      {shown && isFetching && !pin ? (
        <Loader2 className="size-4 text-muted-foreground motion-safe:animate-spin" aria-hidden="true" />
      ) : null}
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            variant="ghost"
            size={large ? "icon-sm" : "icon-xs"}
            className="text-muted-foreground hover:text-foreground"
            aria-label={shown ? "Pincode verbergen" : "Pincode tonen"}
            onClick={() => setShown((s) => !s)}
          >
            {shown ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{shown ? "Verbergen" : "Tonen"}</TooltipContent>
      </Tooltip>
      {shown && pin ? (
        <CopyButton
          value={pin}
          size={large ? "icon-sm" : "icon-xs"}
          className="text-muted-foreground hover:text-foreground"
          successMessage="Pincode gekopieerd"
        />
      ) : null}
    </span>
  );
}
