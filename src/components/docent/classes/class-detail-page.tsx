"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Archive,
  ArchiveRestore,
  CalendarClock,
  CalendarPlus,
  KeyRound,
  LogIn,
  MoreHorizontal,
  Pencil,
  Printer,
  Trash2,
  UserPlus,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { use, useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { PageHeader } from "@/components/app/page-header";
import { StatCard } from "@/components/app/stat-card";
import { EmptyBlock, ErrorState, LoadingState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { routes } from "@/lib/routes";
import { useTRPC } from "@/trpc/react";
import { plural } from "../students/format";
import { AddStudentsSheet } from "./add-students-sheet";
import { ClassFormDialog } from "./class-form-dialog";
import { ClassStudentsTable } from "./class-students-table";

type DialogName = "edit" | "archive" | "delete" | "resetPins" | null;

/** /docent/klassen/[klasId] */
export function ClassDetailPage({
  params,
}: {
  params: Promise<{ klasId: string }>;
}) {
  const { klasId } = use(params);
  const trpc = useTRPC();
  const router = useRouter();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<DialogName>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [pinsReset, setPinsReset] = useState<number | null>(null);

  const query = useQuery(trpc.class.get.queryOptions({ id: klasId }));
  const setArchived = useMutation(trpc.class.setArchived.mutationOptions());
  const remove = useMutation(trpc.class.delete.mutationOptions());
  const resetPins = useMutation(trpc.student.resetPins.mutationOptions());

  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: trpc.class.pathKey() }),
      queryClient.invalidateQueries({ queryKey: trpc.student.pathKey() }),
    ]);

  if (query.isLoading) return <LoadingState />;
  if (query.isError || !query.data) {
    return (
      <>
        <PageHeader
          title="Klas"
          backHref={routes.docent.classes}
          backLabel="Klassen"
        />
        <ErrorState
          title="Deze klas kon niet worden geladen"
          error={query.error}
          onRetry={
            query.error?.data?.code === "NOT_FOUND"
              ? undefined
              : () => query.refetch()
          }
        />
      </>
    );
  }

  const klas = query.data;
  const members = klas.members;
  const active = members.filter((m) => !m.banned).length;
  const loggedIn = members.filter((m) => m.lastLoginAt).length;
  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };

  const description = [
    klas.schoolYear ? `Schooljaar ${klas.schoolYear}` : null,
    klas.description,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <>
      <PageHeader
        title={klas.name}
        backHref={routes.docent.classes}
        backLabel="Klassen"
        description={description || undefined}
        badge={
          klas.archived ? (
            <span className="inline-flex h-6 items-center gap-1 rounded-full bg-muted px-2.5 text-xs font-medium text-muted-foreground ring-1 ring-border ring-inset">
              <Archive className="size-3" aria-hidden="true" />
              Gearchiveerd
            </span>
          ) : null
        }
        actions={
          <>
            <Button onClick={() => setSheetOpen(true)}>
              <UserPlus aria-hidden="true" />
              Leerlingen importeren
            </Button>
            <Button variant="outline" asChild>
              <Link
                href={routes.docent.classLoginCards(klas.id)}
                target="_blank"
                rel="noopener"
              >
                <Printer aria-hidden="true" />
                Inlogkaarten printen
              </Link>
            </Button>
            <Button variant="outline" asChild>
              <Link href={routes.docent.newAssignment({ classId: klas.id })}>
                <CalendarPlus aria-hidden="true" />
                Afname plannen
              </Link>
            </Button>
            <DropdownMenu modal={false}>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="Meer acties">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <DropdownMenuItem onSelect={() => setDialog("edit")}>
                  <Pencil />
                  Bewerken
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setDialog("resetPins")}
                  disabled={members.length === 0}
                >
                  <KeyRound />
                  Alle pincodes resetten
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setDialog("archive")}>
                  {klas.archived ? <ArchiveRestore /> : <Archive />}
                  {klas.archived ? "Terugzetten uit archief" : "Archiveren"}
                </DropdownMenuItem>
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => setDialog("delete")}
                >
                  <Trash2 />
                  Verwijderen
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard
          label="Leerlingen"
          value={members.length}
          icon={UsersRound}
          tone="primary"
          hint={
            members.length - active > 0
              ? `${members.length - active} gedeactiveerd`
              : "Allemaal actief"
          }
        />
        <StatCard
          label="Open afnames"
          value={klas.openAssignmentCount}
          icon={CalendarClock}
          tone={klas.openAssignmentCount > 0 ? "success" : "default"}
          hint={`${plural(klas.assignmentCount, "afname", "afnames")} in totaal`}
        />
        <StatCard
          label="Ingelogd"
          value={loggedIn}
          icon={LogIn}
          tone="info"
          hint={
            members.length > 0
              ? `van de ${members.length} leerlingen (recent)`
              : "Nog geen leerlingen"
          }
        />
      </div>

      <section
        aria-labelledby="students-heading"
        className="flex flex-col gap-3"
      >
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2
            id="students-heading"
            className="font-display text-lg font-bold tracking-tight"
          >
            Leerlingen
          </h2>
          {members.length > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSheetOpen(true)}
            >
              <UserPlus aria-hidden="true" />
              Leerlingen toevoegen
            </Button>
          ) : null}
        </div>
        {members.length === 0 ? (
          <EmptyBlock
            icon={UsersRound}
            title="Nog geen leerlingen in deze klas"
            description="Plak de leerlingenlijst uit Magister of SOMtoday, of kies een CSV-bestand. Iedere leerling krijgt automatisch een pincode."
            action={
              <Button onClick={() => setSheetOpen(true)}>
                <UserPlus aria-hidden="true" />
                Leerlingen importeren
              </Button>
            }
          />
        ) : (
          <ClassStudentsTable classId={klas.id} members={members} />
        )}
      </section>

      <AddStudentsSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        classId={klas.id}
        className={klas.name}
      />

      <ClassFormDialog
        open={dialog === "edit"}
        onOpenChange={close}
        klas={klas}
      />

      <ConfirmDialog
        open={dialog === "archive"}
        onOpenChange={close}
        title={
          klas.archived
            ? `${klas.name} terugzetten?`
            : `${klas.name} archiveren?`
        }
        description={
          klas.archived
            ? "De klas verschijnt weer in je overzicht en bij het plannen van afnames."
            : "De klas verdwijnt uit je overzicht en uit de keuzelijst bij nieuwe afnames. Leerlingen, afnames en resultaten blijven bewaard en je kunt de klas altijd terugzetten."
        }
        confirmLabel={klas.archived ? "Terugzetten" : "Archiveren"}
        onConfirm={async () => {
          await setArchived.mutateAsync({
            id: klas.id,
            archived: !klas.archived,
          });
          await invalidate();
          toast.success(
            klas.archived ? "Klas teruggezet" : "Klas gearchiveerd",
          );
        }}
      />

      <ConfirmDialog
        open={dialog === "delete"}
        onOpenChange={close}
        destructive
        title={`${klas.name} definitief verwijderen?`}
        description={
          klas.assignmentCount > 0
            ? `Alle ${plural(klas.assignmentCount, "afname", "afnames")} van deze klas worden verwijderd, inclusief alle pogingen, antwoorden en cijfers. De leerlingaccounts blijven bestaan. Dit kun je niet ongedaan maken. Overweeg archiveren.`
            : "De klas wordt verwijderd. De leerlingaccounts blijven bestaan. Dit kun je niet ongedaan maken."
        }
        confirmLabel="Klas verwijderen"
        onConfirm={async () => {
          await remove.mutateAsync({ id: klas.id });
          toast.success(`Klas ${klas.name} verwijderd`);
          router.push(routes.docent.classes);
          await queryClient.invalidateQueries({
            queryKey: trpc.class.list.queryKey(),
          });
        }}
      />

      <ConfirmDialog
        open={dialog === "resetPins"}
        onOpenChange={close}
        title={`Alle pincodes van ${klas.name} resetten?`}
        description={`Alle ${plural(members.length, "leerling", "leerlingen")} krijgen een nieuwe pincode en worden uitgelogd. Hun oude inlogkaarten werken daarna niet meer.`}
        confirmLabel="Nieuwe pincodes maken"
        onConfirm={async () => {
          const res = await resetPins.mutateAsync({ classId: klas.id });
          await invalidate();
          setPinsReset(res.length);
        }}
      />

      <Dialog
        open={pinsReset !== null}
        onOpenChange={(open) => !open && setPinsReset(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nieuwe pincodes aangemaakt</DialogTitle>
            <DialogDescription>
              {plural(pinsReset ?? 0, "leerling heeft", "leerlingen hebben")}{" "}
              een nieuwe pincode. Print nieuwe inlogkaarten en deel ze uit.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPinsReset(null)}>
              Sluiten
            </Button>
            <Button asChild>
              <Link
                href={routes.docent.classLoginCards(klas.id)}
                target="_blank"
                rel="noopener"
              >
                <Printer aria-hidden="true" />
                Inlogkaarten printen
              </Link>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
