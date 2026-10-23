"use client";

import { Check, Copy } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button, type ButtonProps } from "@/components/ui/button";
import { toastError } from "@/components/ui/sonner";
import { cn } from "@/lib/utils";

export interface CopyButtonProps
  extends Omit<ButtonProps, "onClick" | "children" | "value"> {
  /** Text placed on the clipboard. */
  value: string;
  /** Visible label. Omit for an icon-only button. */
  label?: string;
  /** Toast shown after copying. Pass `null` for no toast. Default "Gekopieerd". */
  successMessage?: string | null;
}

/** Copies `value` to the clipboard and briefly shows a check mark. */
export function CopyButton({
  value,
  label,
  successMessage = "Gekopieerd",
  variant = "ghost",
  size,
  className,
  ...props
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      if (successMessage) toast.success(successMessage);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(false), 1600);
    } catch {
      toastError(
        "Kopiëren lukte niet. Selecteer de tekst en kopieer handmatig.",
      );
    }
  }

  const Icon = copied ? Check : Copy;

  return (
    <Button
      variant={variant}
      size={size ?? (label ? "sm" : "icon-sm")}
      aria-label={label ? undefined : copied ? "Gekopieerd" : "Kopiëren"}
      className={cn(copied && "text-success-ink", className)}
      onClick={copy}
      {...props}
    >
      <Icon aria-hidden="true" />
      {label ? <span>{copied ? "Gekopieerd" : label}</span> : null}
    </Button>
  );
}
