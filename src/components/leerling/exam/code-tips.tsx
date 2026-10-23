"use client";

import { Info, Lightbulb, TriangleAlert } from "lucide-react";
import { Fragment, useEffect, useRef, useState } from "react";
import { useAnnounce } from "@/components/a11y/live-announcer";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  type CodeTip,
  type CodeTipOptions,
  getCodeTips,
} from "@/lib/python/code-tips";
import { cn } from "@/lib/utils";

const DEBOUNCE_MS = 800;
const NO_TIPS: CodeTip[] = [];

/** Code tips for `code`, recomputed 800 ms after the last change. */
export function useCodeTips(
  code: string,
  options: CodeTipOptions,
  enabled = true,
): CodeTip[] {
  const { starterCode, functionNames, hasIoTests } = options;
  const namesKey = (functionNames ?? []).join("\u0000");
  const [tips, setTips] = useState<CodeTip[]>(() =>
    enabled ? getCodeTips(code, options) : NO_TIPS,
  );
  useEffect(() => {
    if (!enabled) return;
    const timer = setTimeout(() => {
      setTips(
        getCodeTips(code, {
          starterCode,
          functionNames: namesKey ? namesKey.split("\u0000") : [],
          hasIoTests,
        }),
      );
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [code, starterCode, namesKey, hasIoTests, enabled]);
  return enabled ? tips : NO_TIPS;
}

/** Renders `code` spans in a tip message. */
export function TipMessage({ message }: { message: string }) {
  const parts = message.split("`");
  return (
    <>
      {parts.map((part, i) =>
        i % 2 === 1 ? (
          <code
            // biome-ignore lint/suspicious/noArrayIndexKey: static split of one message
            key={i}
            className="rounded bg-muted px-1 py-0.5 font-mono text-[0.85em]"
          >
            {part}
          </code>
        ) : (
          // biome-ignore lint/suspicious/noArrayIndexKey: static split of one message
          <Fragment key={i}>{part}</Fragment>
        ),
      )}
    </>
  );
}

export function CodeTipList({ tips }: { tips: readonly CodeTip[] }) {
  return (
    <ul className="flex flex-col gap-2.5">
      {tips.map((tip) => {
        const Icon = tip.severity === "warning" ? TriangleAlert : Info;
        return (
          <li
            key={`${tip.id}:${tip.line ?? ""}:${tip.message}`}
            className="flex items-start gap-2.5 text-sm leading-6"
          >
            <Icon
              className={cn(
                "mt-1 size-4 shrink-0",
                tip.severity === "warning"
                  ? "text-warning-ink"
                  : "text-info-ink",
              )}
              aria-hidden="true"
            />
            <span className="min-w-0">
              <span className="sr-only">
                {tip.severity === "warning" ? "Let op: " : "Tip: "}
              </span>
              {tip.line ? (
                <span className="mr-1.5 inline-flex rounded-md bg-muted px-1.5 text-xs font-semibold text-muted-foreground tabular-nums">
                  Regel {tip.line}
                </span>
              ) : null}
              <TipMessage message={tip.message} />
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const countText = (n: number) =>
  n === 1 ? "1 tip voor je code." : `${n} tips voor je code.`;

/**
 * "Tips (n)" popover in the code editor toolbar: friendly static checks
 * (never runs the code). Count changes are announced politely.
 */
export function CodeTipsButton({
  code,
  options,
  className,
}: {
  code: string;
  options: CodeTipOptions;
  className?: string;
}) {
  const tips = useCodeTips(code, options);
  const announce = useAnnounce();
  const lastCount = useRef<number | null>(null);
  const warnings = tips.filter((t) => t.severity === "warning").length;

  useEffect(() => {
    const previous = lastCount.current;
    lastCount.current = tips.length;
    if (previous === null || previous === tips.length) return;
    announce(
      tips.length ? countText(tips.length) : "Geen tips meer voor je code.",
      { dedupeKey: "code-tips", dedupeMs: 1500 },
    );
  }, [tips.length, announce]);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={cn(
            "text-muted-foreground",
            warnings > 0 &&
              "bg-warning/12 text-warning-ink hover:bg-warning/20 hover:text-warning-ink",
            className,
          )}
          aria-label={`Tips (${tips.length})`}
        >
          <Lightbulb aria-hidden="true" />
          <span aria-hidden="true">Tips ({tips.length})</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 max-w-[calc(100vw-2rem)]">
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-0.5">
            <p className="font-display text-sm font-semibold">
              Tips voor je code
            </p>
            <p className="text-xs text-muted-foreground">
              Automatische hints op basis van je code. Ze geven geen punten en
              zijn niet altijd van toepassing.
            </p>
          </div>
          {tips.length ? (
            <CodeTipList tips={tips} />
          ) : (
            <p className="text-sm text-muted-foreground">
              Geen tips voor deze code.
            </p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
