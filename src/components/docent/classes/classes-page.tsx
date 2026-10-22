"use client";

import { useQuery } from "@tanstack/react-query";
import { Plus, School } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { PageHeader } from "@/components/app/page-header";
import { EmptyBlock, ErrorState, LoadingState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { routes } from "@/lib/routes";
import { useTRPC } from "@/trpc/react";
import { ClassCard } from "./class-card";
import { ClassFormDialog } from "./class-form-dialog";

/** /docent/klassen: all classes as cards. */
export function ClassesPage() {
  const uid = useId();
  const trpc = useTRPC();
  const router = useRouter();
  const [showArchived, setShowArchived] = useState(false);
  const [creating, setCreating] = useState(false);
  const query = useQuery(
    trpc.class.list.queryOptions({ includeArchived: showArchived }),
  );

  const classes = query.data ?? [];
  const active = classes.filter((c) => !c.archived);
  const archived = classes.filter((c) => c.archived);
  const totalStudents = active.reduce((sum, c) => sum + c.studentCount, 0);

  return (
    <>
      <PageHeader
        title="Klassen"
        description={
          query.data
            ? `${active.length} ${active.length === 1 ? "actieve klas" : "actieve klassen"} met samen ${totalStudents} ${totalStudents === 1 ? "leerling" : "leerlingen"}.`
            : "Beheer je klassen, voeg leerlingen toe en print inlogkaarten."
        }
        actions={
          <>
            <label
              htmlFor={`${uid}-show-archived`}
              className="inline-flex h-9 cursor-pointer items-center gap-2 rounded-md px-2 text-sm text-muted-foreground select-none hover:text-foreground"
            >
              <Switch
                id={`${uid}-show-archived`}
                checked={showArchived}
                onCheckedChange={setShowArchived}
                size="sm"
              />
              Toon gearchiveerd
            </label>
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden="true" />
              Nieuwe klas
            </Button>
          </>
        }
      />

      {query.isLoading ? (
        <LoadingState variant="list" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : classes.length === 0 ? (
        <EmptyBlock
          icon={School}
          title="Nog geen klassen"
          description="Maak je eerste klas aan. Daarna plak je de leerlingenlijst uit Magister of SOMtoday en print je de inlogkaarten."
          action={
            <Button onClick={() => setCreating(true)}>
              <Plus aria-hidden="true" />
              Nieuwe klas
            </Button>
          }
        />
      ) : (
        <div className="flex flex-col gap-8">
          {active.length > 0 ? (
            <section
              aria-label="Actieve klassen"
              className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3"
            >
              {active.map((c) => (
                <ClassCard key={c.id} klas={c} />
              ))}
            </section>
          ) : (
            <EmptyBlock
              icon={School}
              title="Geen actieve klassen"
              description="Alle klassen zijn gearchiveerd."
              action={
                <Button onClick={() => setCreating(true)}>
                  <Plus aria-hidden="true" />
                  Nieuwe klas
                </Button>
              }
            />
          )}
          {showArchived && archived.length > 0 ? (
            <section
              aria-labelledby={`${uid}-archived-heading`}
              className="flex flex-col gap-3"
            >
              <h2
                id={`${uid}-archived-heading`}
                className="text-sm font-medium tracking-wide text-muted-foreground uppercase"
              >
                Gearchiveerd
              </h2>
              <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {archived.map((c) => (
                  <ClassCard key={c.id} klas={c} />
                ))}
              </div>
            </section>
          ) : null}
        </div>
      )}

      <ClassFormDialog
        open={creating}
        onOpenChange={setCreating}
        onSaved={(klas) => router.push(routes.docent.class(klas.id))}
      />
    </>
  );
}
