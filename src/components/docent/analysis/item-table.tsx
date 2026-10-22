"use client";

import { Ban, CircleHelp, Loader2, MoreHorizontal, Undo2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { ScrollRegion } from "@/components/a11y/scroll-region";
import { getErrorMessage } from "@/components/app/get-error-message";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { QUESTION_TYPE_LABELS } from "@/lib/questions/schema";
import { cn } from "@/lib/utils";
import type { RouterOutputs } from "@/trpc/react";
import { formatStat } from "./format";
import { NeutralizeDialog, useNeutralizeMutation } from "./neutralize-dialog";

type Analysis = RouterOutputs["analysis"]["assignment"];
type Item = Analysis["items"][number];

const FLAG_CLASSES: Record<Item["flags"][number]["tone"], string> = {
  info: "bg-info/10 text-info-ink ring-info/25",
  warning: "bg-warning/12 text-warning-ink ring-warning/30",
  destructive: "bg-destructive/10 text-destructive-ink ring-destructive/25",
  success: "bg-success/10 text-success-ink ring-success/25",
};

export function ItemTable({
  assignmentId,
  items,
}: {
  assignmentId: string;
  items: Item[];
}) {
  const [target, setTarget] = useState<Item | null>(null);
  const neutralize = useNeutralizeMutation();

  const undo = async (item: Item) => {
    try {
      await neutralize.mutateAsync({
        assignmentId,
        questionId: item.questionId,
        mode: null,
      });
      toast.success(`V${item.number} telt weer mee`);
    } catch (err) {
      toast.error(getErrorMessage(err));
    }
  };

  return (
    <>
      <ScrollRegion
        label="Analyse per vraag"
        className="relative rounded-xl border bg-card shadow-xs"
      >
        <table className="w-full text-sm">
          <caption className="sr-only">Analyse per vraag</caption>
          <thead className="bg-muted/40 text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="w-10 px-3 py-2.5 font-medium">
                #
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                Vraag
              </th>
              <th
                scope="col"
                className="hidden px-3 py-2.5 font-medium md:table-cell"
              >
                Type
              </th>
              <th scope="col" className="min-w-36 px-3 py-2.5 font-medium">
                <span className="inline-flex items-center gap-1">
                  p-waarde
                  <StatsHelp />
                </span>
              </th>
              <th scope="col" className="px-3 py-2.5 text-right font-medium">
                Rir
              </th>
              <th scope="col" className="px-3 py-2.5 font-medium">
                Signaal
              </th>
              <th scope="col" className="w-12 px-2 py-2.5">
                <span className="sr-only">Acties</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {items.map((item) => (
              <tr
                key={item.questionId}
                className={cn(item.neutralized && "bg-muted/30")}
              >
                <td className="px-3 py-3 text-xs font-semibold text-muted-foreground tabular-nums">
                  <abbr title={`Vraag ${item.number}`} className="no-underline">
                    V{item.number}
                  </abbr>
                </td>
                <th scope="row" className="px-3 py-3 text-left font-medium">
                  <span className="flex flex-wrap items-center gap-2">
                    {item.title}
                    {item.neutralized ? (
                      <span className="inline-flex items-center gap-1 rounded-full bg-warning/12 px-2 py-0.5 text-[11px] font-medium text-warning-ink">
                        <Ban className="size-3" aria-hidden="true" />
                        Vervallen
                        <span className="sr-only">
                          {item.neutralized === "drop"
                            ? " (telt niet mee)"
                            : " (iedereen de volle punten)"}
                        </span>
                      </span>
                    ) : null}
                  </span>
                  <span className="block text-xs font-normal text-muted-foreground md:hidden">
                    {QUESTION_TYPE_LABELS[item.type]}
                  </span>
                </th>
                <td className="hidden px-3 py-3 text-muted-foreground md:table-cell">
                  {QUESTION_TYPE_LABELS[item.type]}
                </td>
                <td className="px-3 py-3">
                  <PValue p={item.excluded ? null : item.p} />
                </td>
                <td className="px-3 py-3 text-right tabular-nums">
                  <span
                    className={cn(
                      item.rir != null &&
                        item.rir < 0 &&
                        "font-semibold text-destructive-ink",
                    )}
                  >
                    {formatStat(item.excluded ? null : item.rir)}
                  </span>
                </td>
                <td className="px-3 py-3">
                  <span className="flex flex-wrap gap-1">
                    {item.pendingReview > 0 ? (
                      <span className="inline-flex rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground ring-1 ring-border ring-inset">
                        Nog {item.pendingReview} na te kijken
                      </span>
                    ) : null}
                    {item.flags.map((f) => (
                      <span
                        key={f.key}
                        className={cn(
                          "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium ring-1 ring-inset",
                          FLAG_CLASSES[f.tone],
                        )}
                      >
                        {f.label}
                      </span>
                    ))}
                    {!item.flags.length && !item.pendingReview ? (
                      <span className="text-xs text-muted-foreground">–</span>
                    ) : null}
                  </span>
                </td>
                <td className="px-2 py-3 text-right">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Acties voor vraag ${item.number}`}
                        disabled={neutralize.isPending}
                      >
                        {neutralize.isPending &&
                        neutralize.variables?.questionId === item.questionId ? (
                          <Loader2
                            className="motion-safe:animate-spin"
                            aria-hidden="true"
                          />
                        ) : (
                          <MoreHorizontal aria-hidden="true" />
                        )}
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60">
                      <DropdownMenuLabel className="truncate">
                        V{item.number} · {item.title}
                      </DropdownMenuLabel>
                      {item.neutralized ? (
                        <DropdownMenuItem onSelect={() => void undo(item)}>
                          <Undo2 aria-hidden="true" />
                          Ongedaan maken
                        </DropdownMenuItem>
                      ) : (
                        <DropdownMenuItem onSelect={() => setTarget(item)}>
                          <Ban aria-hidden="true" />
                          Vraag laten vervallen…
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </ScrollRegion>
      <NeutralizeDialog
        open={!!target}
        onOpenChange={(o) => !o && setTarget(null)}
        assignmentId={assignmentId}
        question={target}
      />
    </>
  );
}

/** Bar plus number; the number is the accessible value. */
function PValue({ p }: { p: number | null }) {
  if (p == null)
    return <span className="text-xs text-muted-foreground">–</span>;
  const pct = Math.round(p * 100);
  return (
    <span className="flex items-center gap-2">
      <span
        className="h-2 w-20 shrink-0 overflow-hidden rounded-full bg-muted"
        aria-hidden="true"
      >
        <span
          className={cn(
            "block h-full rounded-full",
            p < 0.3 ? "bg-warning" : p > 0.9 ? "bg-info" : "bg-primary",
          )}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="font-medium tabular-nums">{formatStat(p)}</span>
    </span>
  );
}

function StatsHelp() {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-grid size-5 place-items-center rounded-full text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50"
          aria-label="Uitleg over p-waarde en Rir"
        >
          <CircleHelp className="size-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 text-sm leading-relaxed font-normal text-foreground">
        <p>
          <strong>p-waarde:</strong> het deel van de punten dat de klas
          gemiddeld haalde (0 = niemand goed, 1 = iedereen goed).
        </p>
        <p className="mt-2">
          <strong>Rir:</strong> hoe goed de vraag sterke en zwakke leerlingen
          onderscheidt. Onder 0,20 is laag; negatief betekent vaak dat er iets
          mis is met de vraag.
        </p>
      </PopoverContent>
    </Popover>
  );
}
