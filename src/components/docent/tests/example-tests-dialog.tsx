"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronDown,
  ListChecks,
  Loader2,
  MessageSquareText,
  Plus,
  Sparkles,
  SquareCode,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { type ReactNode, useId, useState } from "react";
import { toast } from "sonner";
import { getErrorMessage } from "@/components/app/get-error-message";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { routes } from "@/lib/routes";
import { cn } from "@/lib/utils";
import { type RouterOutputs, useTRPC } from "@/trpc/react";

type Example = RouterOutputs["bank"]["examples"][number];

/**
 * “Voorbeeldtoetsen”: three ready-made Dutch tests. “Toevoegen als concept”
 * copies one into a new draft test and opens it in the builder.
 */
export function ExampleTestsDialog({ trigger }: { trigger?: ReactNode }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const examples = useQuery({
    ...trpc.bank.examples.queryOptions(),
    enabled: open,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const importExample = useMutation(
    trpc.bank.importExample.mutationOptions({
      onSuccess: async (res, variables) => {
        const title =
          examples.data?.find((e) => e.id === variables.exampleId)?.title ??
          "De voorbeeldtoets";
        await queryClient.invalidateQueries({
          queryKey: trpc.test.list.pathKey(),
        });
        toast.success(`“${title}” is toegevoegd als concept.`);
        setOpen(false);
        router.push(routes.docent.test(res.id));
      },
      onError: (error) => toast.error(getErrorMessage(error)),
    }),
  );

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button variant="outline">
            <Sparkles aria-hidden="true" />
            Voorbeeldtoetsen
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="flex max-h-[min(46rem,calc(100dvh-2rem))] flex-col gap-4 sm:max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5 text-primary" aria-hidden="true" />
            Voorbeeldtoetsen
          </DialogTitle>
          <DialogDescription>
            Kant-en-klare toetsen met modeloplossingen, verborgen tests en
            onderwerpen. Je krijgt een eigen kopie als concept die je daarna
            helemaal kunt aanpassen.
          </DialogDescription>
        </DialogHeader>
        <div className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1 pb-1">
          {examples.isPending ? (
            <p className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2
                className="size-4 motion-safe:animate-spin"
                aria-hidden="true"
              />
              Voorbeelden laden…
            </p>
          ) : examples.isError ? (
            <p className="rounded-lg bg-destructive/[0.07] px-3 py-2 text-sm text-destructive-ink">
              {getErrorMessage(examples.error)}
            </p>
          ) : (
            <ul className="grid gap-3 md:grid-cols-3">
              {examples.data.map((example) => (
                <ExampleCard
                  key={example.id}
                  example={example}
                  pending={
                    importExample.isPending &&
                    importExample.variables?.exampleId === example.id
                  }
                  disabled={importExample.isPending}
                  onImport={() =>
                    importExample.mutate({ exampleId: example.id })
                  }
                />
              ))}
            </ul>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ExampleCard({
  example,
  pending,
  disabled,
  onImport,
}: {
  example: Example;
  pending: boolean;
  disabled: boolean;
  onImport: () => void;
}) {
  const id = useId();
  const [showQuestions, setShowQuestions] = useState(false);
  const points = example.totalPoints.toLocaleString("nl-NL");
  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-xs">
      <div className="flex flex-col gap-1.5">
        <span className="w-fit rounded-full bg-primary/10 px-2 py-0.5 text-[0.7rem] font-semibold text-primary">
          {example.level}
        </span>
        <h3 id={`${id}-title`} className="leading-snug font-semibold">
          {example.title}
        </h3>
        <p className="text-sm leading-relaxed text-muted-foreground">
          {example.summary}
        </p>
      </div>
      <dl className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
        <div className="flex gap-1">
          <dt className="sr-only">Vragen</dt>
          <dd>
            {example.questionCount} vragen · {points} punten
          </dd>
        </div>
        <TypeCount
          icon={<SquareCode aria-hidden="true" />}
          n={example.typeCounts.code}
          label="programmeervragen"
        />
        <TypeCount
          icon={<ListChecks aria-hidden="true" />}
          n={example.typeCounts.multiple_choice}
          label="meerkeuzevragen"
        />
        <TypeCount
          icon={<MessageSquareText aria-hidden="true" />}
          n={example.typeCounts.open}
          label="open vragen"
        />
      </dl>
      {example.tags.length > 0 ? (
        <ul className="flex flex-wrap gap-1" aria-label="Onderwerpen">
          {example.tags.map((tag) => (
            <li
              key={tag}
              className="rounded-full bg-secondary px-2 py-0.5 text-[0.7rem] font-medium text-secondary-foreground"
            >
              {tag}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="flex flex-col gap-1.5">
        <button
          type="button"
          aria-expanded={showQuestions}
          aria-controls={`${id}-questions`}
          onClick={() => setShowQuestions((s) => !s)}
          className="inline-flex w-fit items-center gap-1 rounded text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring/50"
        >
          <ChevronDown
            className={cn(
              "size-3.5 transition-transform",
              showQuestions && "rotate-180",
            )}
            aria-hidden="true"
          />
          {showQuestions ? "Vragen verbergen" : "Bekijk de vragen"}
        </button>
        <ol
          id={`${id}-questions`}
          hidden={!showQuestions}
          className="list-decimal pl-5 text-xs leading-relaxed text-muted-foreground"
        >
          {example.questionTitles.map((title, i) => (
            // biome-ignore lint/suspicious/noArrayIndexKey: static list
            <li key={i}>{title}</li>
          ))}
        </ol>
      </div>
      <Button
        className="mt-auto"
        onClick={onImport}
        disabled={disabled}
        aria-describedby={`${id}-title`}
      >
        {pending ? (
          <Loader2 className="motion-safe:animate-spin" aria-hidden="true" />
        ) : (
          <Plus aria-hidden="true" />
        )}
        Toevoegen als concept
      </Button>
    </li>
  );
}

function TypeCount({
  icon,
  n,
  label,
}: {
  icon: ReactNode;
  n: number;
  label: string;
}) {
  if (n === 0) return null;
  return (
    <div className="flex items-center gap-1 [&>svg]:size-3.5">
      {icon}
      <dt className="sr-only">{label}</dt>
      <dd>{n}</dd>
    </div>
  );
}
