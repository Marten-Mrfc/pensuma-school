"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { FolderInput, Loader2, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/components/app/get-error-message";
import { StatusBadge } from "@/components/app/status-badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { MAX_QUESTIONS_PER_TEST } from "@/lib/questions/validate";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { useTRPC } from "@/trpc/react";

export function CopyToTestDialog({
  open,
  onOpenChange,
  questionId,
  questionTitle,
  currentTestId,
  beforeCopy,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  questionId: string | null;
  questionTitle: string;
  currentTestId: string;
  /** Save pending edits first. */
  beforeCopy: () => Promise<boolean>;
}) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const [target, setTarget] = useState<string | null>(null);
  const list = useQuery({
    ...trpc.test.list.queryOptions({ status: "active" }),
    enabled: open,
  });
  const copy = useMutation(trpc.question.copyToTest.mutationOptions());

  const term = search.trim().toLowerCase();
  const tests = (list.data ?? []).filter(
    (t) =>
      t.id !== currentTestId &&
      (!term || t.title.toLowerCase().includes(term) || (t.topic ?? "").toLowerCase().includes(term)),
  );

  async function submit() {
    if (!questionId || !target) return;
    await beforeCopy();
    try {
      const res = await copy.mutateAsync({ id: questionId, targetTestId: target });
      const targetTest = list.data?.find((t) => t.id === target);
      await queryClient.invalidateQueries({ queryKey: trpc.test.pathKey() });
      onOpenChange(false);
      setTarget(null);
      toast.success(`Vraag gekopieerd naar “${targetTest?.title ?? "de toets"}”.`, {
        action: {
          label: "Openen",
          onClick: () => router.push(routes.docent.test(res.targetTestId)),
        },
      });
    } catch (error) {
      toast.error(getErrorMessage(error));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[min(40rem,calc(100dvh-2rem))] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Kopiëren naar andere toets</DialogTitle>
          <DialogDescription>
            “{questionTitle || "Naamloze vraag"}” wordt achteraan de gekozen toets toegevoegd.
          </DialogDescription>
        </DialogHeader>
        <Input
          prefixIcon={<Search className="size-4 text-muted-foreground" aria-hidden="true" />}
          placeholder="Zoek een toets…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          aria-label="Zoek een toets"
        />
        <div className="-mx-1 min-h-40 flex-1 overflow-y-auto px-1">
          {list.isPending ? (
            <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
              <Loader2 className="size-4 motion-safe:animate-spin" aria-hidden="true" /> Toetsen laden…
            </p>
          ) : tests.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">
              Geen andere toetsen gevonden.{" "}
              <Link href={routes.docent.tests} className="text-primary underline-offset-4 hover:underline">
                Maak eerst een toets
              </Link>
              .
            </p>
          ) : (
            <ul className="flex flex-col gap-1.5" aria-label="Toetsen">
              {tests.map((t) => {
                const full = t.questionCount >= MAX_QUESTIONS_PER_TEST;
                const selected = target === t.id;
                return (
                  <li key={t.id}>
                    <button
                      type="button"
                      disabled={full}
                      aria-pressed={selected}
                      onClick={() => setTarget(t.id)}
                      className={cn(
                        "flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors outline-none hover:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
                        selected && "border-primary/60 bg-primary/[0.06] ring-1 ring-primary/30",
                      )}
                    >
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="truncate text-sm font-medium">{t.title}</span>
                        <span className="text-xs text-muted-foreground">
                          {t.questionCount} {t.questionCount === 1 ? "vraag" : "vragen"}
                          {t.topic ? ` · ${t.topic}` : ""}
                          {full ? " · vol" : ""}
                        </span>
                      </span>
                      <StatusBadge kind="test" status={t.status} />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuleren
          </Button>
          <Button onClick={() => void submit()} disabled={!target || copy.isPending}>
            {copy.isPending ? (
              <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
            ) : (
              <FolderInput aria-hidden="true" />
            )}
            Kopiëren
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
