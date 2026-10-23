"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  KeyRound,
  MoreHorizontal,
  Trash2,
  UserPlus,
  UsersRound,
} from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/app/confirm-dialog";
import { PageHeader } from "@/components/app/page-header";
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
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { routes } from "@/lib/routes";
import { type RouterOutputs, useTRPC } from "@/trpc/react";
import {
  formatDate,
  formatDateTime,
  initials,
  plural,
} from "../students/format";
import { AddTeacherDialog } from "./add-teacher-dialog";
import { TemporaryPasswordView } from "./temporary-password-view";

type Teacher = RouterOutputs["staff"]["list"][number];

/** /docent/docenten: teacher accounts. */
export function StaffPage() {
  const trpc = useTRPC();
  const [adding, setAdding] = useState(false);
  const query = useQuery(trpc.staff.list.queryOptions());

  return (
    <>
      <PageHeader
        title="Docenten"
        description={
          query.data
            ? `${plural(query.data.length, "docent", "docenten")} met toegang tot Pensuma. Iedere docent kan alles beheren.`
            : "Docentaccounts met toegang tot Pensuma."
        }
        actions={
          <Button onClick={() => setAdding(true)}>
            <UserPlus aria-hidden="true" />
            Docent toevoegen
          </Button>
        }
      />

      {query.isLoading ? (
        <LoadingState variant="list" />
      ) : query.isError ? (
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      ) : !query.data?.length ? (
        <EmptyBlock icon={UsersRound} title="Geen docenten gevonden" />
      ) : (
        <ul className="divide-y overflow-hidden rounded-xl border bg-card shadow-xs">
          {query.data.map((t) => (
            <TeacherRow key={t.id} teacher={t} />
          ))}
        </ul>
      )}

      <AddTeacherDialog open={adding} onOpenChange={setAdding} />
    </>
  );
}

function TeacherRow({ teacher: t }: { teacher: Teacher }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const [dialog, setDialog] = useState<"reset" | "remove" | null>(null);
  const [password, setPassword] = useState<string | null>(null);
  const resetPassword = useMutation(trpc.staff.resetPassword.mutationOptions());
  const remove = useMutation(trpc.staff.remove.mutationOptions());

  const close = (open: boolean) => {
    if (!open) setDialog(null);
  };

  return (
    <li className="flex items-center gap-4 px-4 py-3.5 sm:px-5">
      <span
        aria-hidden="true"
        className="grid size-10 shrink-0 place-items-center rounded-full bg-muted text-sm font-semibold text-muted-foreground"
      >
        {initials(t.name)}
      </span>
      <div className="flex min-w-0 flex-1 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className="truncate font-medium">{t.name}</span>
          {t.isMe ? (
            <span className="inline-flex h-6 w-fit shrink-0 items-center rounded-sm bg-secondary px-2 text-xs font-medium whitespace-nowrap text-secondary-foreground">
              Jij
            </span>
          ) : null}
          {t.passwordChangeRequired ? (
            <span className="inline-flex h-6 w-fit shrink-0 items-center rounded-sm bg-warning/15 px-2 text-xs font-medium whitespace-nowrap text-warning-ink">
              Tijdelijk wachtwoord
            </span>
          ) : null}
        </span>
        <span className="truncate text-sm text-muted-foreground">
          {t.email}
        </span>
      </div>
      <div className="hidden flex-col items-end gap-0.5 text-xs text-muted-foreground sm:flex">
        <span>
          Laatst ingelogd: {formatDateTime(t.lastLoginAt, "onbekend")}
        </span>
        <span>Account sinds {formatDate(t.createdAt)}</span>
      </div>
      {t.isMe ? (
        <Button variant="ghost" size="sm" asChild>
          <Link href={routes.docent.account}>Mijn account</Link>
        </Button>
      ) : (
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Acties voor ${t.name}`}
            >
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuItem onSelect={() => setDialog("reset")}>
              <KeyRound />
              Wachtwoord resetten
            </DropdownMenuItem>
            <DropdownMenuItem
              variant="destructive"
              onSelect={() => setDialog("remove")}
            >
              <Trash2 />
              Verwijderen
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <ConfirmDialog
        open={dialog === "reset"}
        onOpenChange={close}
        title={`Wachtwoord van ${t.name} resetten?`}
        description="Er wordt een nieuw tijdelijk wachtwoord gemaakt. De docent wordt op alle apparaten uitgelogd, kan het oude wachtwoord niet meer gebruiken en kiest bij de volgende keer inloggen een eigen wachtwoord."
        confirmLabel="Nieuw wachtwoord maken"
        onConfirm={async () => {
          const res = await resetPassword.mutateAsync({ id: t.id });
          setPassword(res.password);
          await queryClient.invalidateQueries({
            queryKey: trpc.staff.pathKey(),
          });
        }}
      />
      <ConfirmDialog
        open={dialog === "remove"}
        onOpenChange={close}
        destructive
        title={`${t.name} verwijderen?`}
        description="De docent kan niet meer inloggen. Toetsen en afnames die deze docent heeft gemaakt blijven bestaan."
        confirmLabel="Docent verwijderen"
        onConfirm={async () => {
          await remove.mutateAsync({ id: t.id });
          await queryClient.invalidateQueries({
            queryKey: trpc.staff.pathKey(),
          });
          toast.success(`${t.name} is verwijderd`);
        }}
      />
      <Dialog
        open={password !== null}
        onOpenChange={(open) => !open && setPassword(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nieuw tijdelijk wachtwoord</DialogTitle>
            <DialogDescription>
              Geef dit wachtwoord aan {t.name}. Daarmee kan de docent inloggen
              met {t.email}.
            </DialogDescription>
          </DialogHeader>
          {password ? (
            <TemporaryPasswordView email={t.email} password={password} />
          ) : null}
          <DialogFooter>
            <Button onClick={() => setPassword(null)}>Klaar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </li>
  );
}
