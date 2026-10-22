"use client";

import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { toast } from "sonner";
import { useAnnounce } from "@/components/a11y/live-announcer";
import { ErrorState, LoadingState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { downloadTextFile } from "@/lib/export/download";
import { localDateStamp } from "@/lib/privacy/export-format";
import { formatSubjects } from "@/lib/privacy/register";
import { useTRPC } from "@/trpc/react";
import { PanelCard } from "./notice";

/** The processing register (AVG art. 30) with a Markdown download. */
export function ProcessingRegister() {
  const trpc = useTRPC();
  const announce = useAnnounce();
  const query = useQuery(trpc.privacy.processingRegister.queryOptions());

  return (
    <PanelCard
      title="Verwerkingsregister"
      description="Een overzicht per soort gegevens: doel, grondslag, bewaartermijn en wie de gegevens kan zien. Geef het aan de FG voor het verwerkingsregister van de school."
      actions={
        <Button
          variant="outline"
          disabled={!query.data}
          onClick={() => {
            if (!query.data) return;
            downloadTextFile(
              `pensuma-verwerkingsregister-${localDateStamp()}.md`,
              query.data.markdown,
              "text/markdown;charset=utf-8",
            );
            const message = "Verwerkingsregister gedownload.";
            toast.success(message);
            announce(message);
          }}
        >
          <Download aria-hidden="true" />
          Download als Markdown
        </Button>
      }
    >
      {query.isPending ? (
        <LoadingState variant="list" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {query.data.categories.map((c) => (
            <li
              key={c.id}
              className="flex flex-col gap-2 rounded-xl border p-4"
            >
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-semibold">{c.label}</h3>
                <span className="text-xs text-muted-foreground">
                  {formatSubjects(c.subjects)}
                </span>
              </div>
              <p className="text-sm text-muted-foreground">{c.examples}</p>
              <dl className="grid gap-1.5 text-sm">
                <div className="grid gap-0.5 sm:grid-cols-[8rem_1fr] sm:gap-3">
                  <dt className="text-xs font-medium text-muted-foreground sm:text-sm">
                    Doel
                  </dt>
                  <dd>{c.purpose}</dd>
                </div>
                <div className="grid gap-0.5 sm:grid-cols-[8rem_1fr] sm:gap-3">
                  <dt className="text-xs font-medium text-muted-foreground sm:text-sm">
                    Grondslag
                  </dt>
                  <dd>{c.legalBasis}</dd>
                </div>
                <div className="grid gap-0.5 sm:grid-cols-[8rem_1fr] sm:gap-3">
                  <dt className="text-xs font-medium text-muted-foreground sm:text-sm">
                    Bewaartermijn
                  </dt>
                  <dd>{c.retention}</dd>
                </div>
                <div className="grid gap-0.5 sm:grid-cols-[8rem_1fr] sm:gap-3">
                  <dt className="text-xs font-medium text-muted-foreground sm:text-sm">
                    Ontvangers
                  </dt>
                  <dd>{c.recipients}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>
      )}
    </PanelCard>
  );
}
