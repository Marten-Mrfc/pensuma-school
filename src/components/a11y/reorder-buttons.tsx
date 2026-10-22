"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useLayoutEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useAnnounce } from "./live-announcer";

type Direction = "up" | "down";

export interface ReorderButtonsProps {
  /** Current position (0-based). */
  index: number;
  count: number;
  /** Name of the item, e.g. "Vraag Rekenmachine": used in labels and announcements. */
  itemLabel: string;
  onMove: (from: number, to: number) => void;
  /**
   * Stable id of the item. Lets focus follow the moved item even when the
   * list re-renders its rows in a new order.
   */
  itemKey?: string;
  className?: string;
}

/** Item that should get focus after the list re-renders. */
let pendingFocus: { itemKey: string; direction: Direction } | null = null;

/**
 * Keyboard and screen-reader friendly alternative to drag-and-drop
 * (WCAG 2.5.7): "omhoog" / "omlaag" buttons that keep focus on the moved
 * item and announce its new position.
 */
export function ReorderButtons({
  index,
  count,
  itemLabel,
  onMove,
  itemKey,
  className,
}: ReorderButtonsProps) {
  const announce = useAnnounce();
  const upRef = useRef<HTMLButtonElement>(null);
  const downRef = useRef<HTMLButtonElement>(null);
  // Used when no itemKey is given and this instance survives the re-render.
  const localPending = useRef<Direction | null>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: re-run after every position change
  useLayoutEffect(() => {
    let direction: Direction | null = null;
    if (itemKey !== undefined && pendingFocus?.itemKey === itemKey) {
      direction = pendingFocus.direction;
      pendingFocus = null;
    } else if (localPending.current) {
      direction = localPending.current;
    }
    localPending.current = null;
    if (!direction) return;
    const preferred = direction === "up" ? upRef.current : downRef.current;
    const other = direction === "up" ? downRef.current : upRef.current;
    const target = preferred && !preferred.disabled ? preferred : other;
    target?.focus();
  }, [index, itemKey]);

  function move(direction: Direction) {
    const to = direction === "up" ? index - 1 : index + 1;
    if (to < 0 || to >= count) return;
    if (itemKey !== undefined) pendingFocus = { itemKey, direction };
    else localPending.current = direction;
    onMove(index, to);
    announce(`${itemLabel} staat nu op plek ${to + 1} van ${count}.`, {
      dedupeKey: `reorder:${itemKey ?? itemLabel}:${to}`,
      dedupeMs: 300,
    });
  }

  return (
    <div className={cn("flex items-center gap-0.5", className)}>
      <Button
        ref={upRef}
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`${itemLabel} omhoog`}
        disabled={index <= 0}
        onClick={() => move("up")}
      >
        <ChevronUp aria-hidden="true" />
      </Button>
      <Button
        ref={downRef}
        type="button"
        variant="ghost"
        size="icon-sm"
        aria-label={`${itemLabel} omlaag`}
        disabled={index >= count - 1}
        onClick={() => move("down")}
      >
        <ChevronDown aria-hidden="true" />
      </Button>
    </div>
  );
}
