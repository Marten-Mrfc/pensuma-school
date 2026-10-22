"use client";

import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CircleAlert, Printer, Scissors } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { LogoMark } from "@/components/app/logo";
import { EmptyBlock, ErrorState, LoadingState } from "@/components/app/states";
import { Button } from "@/components/ui/button";
import { QrCode } from "@/components/ui/qr-code";
import { routes } from "@/lib/routes";
import { useTRPC } from "@/trpc/react";
import { formatPin, plural } from "./format";

const CARDS_PER_SHEET = 8;
const subscribeNoop = () => () => {};

/** window.location.origin after hydration ("" on the server). */
function useOrigin() {
  return useSyncExternalStore(
    subscribeNoop,
    () => window.location.origin,
    () => "",
  );
}

type CardStudent = {
  id: string;
  name: string;
  studentNumber: string;
  pin: string | null;
};

export interface LoginCardsViewProps {
  /** Print the students of this class (optionally only `ids`). */
  classId?: string;
  /** Specific student ids (comma-separated in the URL). */
  ids?: string[];
}

/** Printable A4 sheets with cut-out login cards (8 per page). */
export function LoginCardsView({ classId, ids }: LoginCardsViewProps) {
  const trpc = useTRPC();
  const origin = useOrigin();
  const hasIds = Boolean(ids && ids.length > 0);

  const pinsQuery = useQuery({
    ...trpc.student.getPins.queryOptions({
      classId,
      userIds: hasIds ? ids : undefined,
    }),
    enabled: Boolean(classId) || hasIds,
    staleTime: 0,
  });
  const classQuery = useQuery({
    ...trpc.class.get.queryOptions({ id: classId ?? "" }),
    enabled: Boolean(classId),
  });

  const className = classQuery.data?.name;
  const backHref = classId
    ? routes.docent.class(classId)
    : ids?.length === 1
      ? routes.docent.student(ids[0])
      : routes.docent.students;

  if (!classId && !hasIds) {
    return (
      <Shell backHref={routes.docent.students}>
        <EmptyBlock
          title="Geen leerlingen gekozen"
          description="Open deze pagina vanuit een klas of leerling."
        />
      </Shell>
    );
  }
  if (pinsQuery.isLoading) {
    return (
      <Shell backHref={backHref}>
        <LoadingState variant="list" />
      </Shell>
    );
  }
  if (pinsQuery.isError) {
    return (
      <Shell backHref={backHref}>
        <ErrorState
          error={pinsQuery.error}
          onRetry={() => pinsQuery.refetch()}
        />
      </Shell>
    );
  }

  const students: CardStudent[] = pinsQuery.data ?? [];
  const missing = students.filter((s) => !s.pin);
  const sheets: CardStudent[][] = [];
  for (let i = 0; i < students.length; i += CARDS_PER_SHEET) {
    sheets.push(students.slice(i, i + CARDS_PER_SHEET));
  }
  const host = origin.replace(/^https?:\/\//, "");

  return (
    <div className="flex min-h-dvh flex-col bg-muted/50 print:block print:min-h-0 print:bg-transparent">
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur-md print:hidden">
        <div className="mx-auto flex w-full max-w-5xl flex-wrap items-center gap-3 px-4 py-3 sm:px-6">
          <Button variant="ghost" size="sm" asChild>
            <Link href={backHref}>
              <ArrowLeft aria-hidden="true" />
              Terug
            </Link>
          </Button>
          <div className="flex min-w-0 flex-1 flex-col">
            <h1 className="truncate font-display text-lg leading-tight font-bold tracking-tight">
              Inlogkaarten{className ? ` · ${className}` : ""}
            </h1>
            <p className="text-xs text-muted-foreground">
              {plural(students.length, "kaart", "kaarten")} ·{" "}
              {plural(sheets.length, "A4-pagina", "A4-pagina's")} ·{" "}
              {CARDS_PER_SHEET} per pagina
            </p>
          </div>
          <Button
            onClick={() => window.print()}
            disabled={students.length === 0}
          >
            <Printer aria-hidden="true" />
            Afdrukken
          </Button>
        </div>
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-2 px-4 pb-3 text-xs text-muted-foreground sm:px-6">
          <p className="flex items-center gap-1.5">
            <Scissors className="size-3.5 shrink-0" aria-hidden="true" />
            Kies in het printvenster A4, schaal 100% (ware grootte) en zet kop-
            en voetteksten uit. Knip langs de stippellijnen.
          </p>
          {missing.length > 0 ? (
            <p className="flex items-start gap-1.5 rounded-md bg-warning/12 px-2.5 py-1.5 font-medium text-warning-ink">
              <CircleAlert
                className="mt-px size-3.5 shrink-0"
                aria-hidden="true"
              />
              Van {plural(missing.length, "leerling", "leerlingen")} is de
              pincode onbekend ({missing.map((m) => m.name).join(", ")}). Reset
              de pincode eerst.
            </p>
          ) : null}
        </div>
      </header>

      {students.length === 0 ? (
        <div className="mx-auto w-full max-w-3xl p-6 print:hidden">
          <EmptyBlock
            title="Geen leerlingen om te printen"
            description="Voeg eerst leerlingen toe aan deze klas."
            action={
              <Button variant="outline" asChild>
                <Link href={backHref}>Terug</Link>
              </Button>
            }
          />
        </div>
      ) : (
        <main className="login-sheets px-4 py-8 print:p-0">
          {sheets.map((sheet, i) => (
            <section
              // biome-ignore lint/suspicious/noArrayIndexKey: sheets are positional
              key={i}
              className="login-sheet login-paper"
              aria-label={`Pagina ${i + 1} van ${sheets.length}`}
            >
              {sheet.map((s) => (
                <LoginCard
                  key={s.id}
                  student={s}
                  className={className}
                  origin={origin}
                  host={host}
                />
              ))}
            </section>
          ))}
        </main>
      )}
    </div>
  );
}

function Shell({
  backHref,
  children,
}: {
  backHref: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 p-6">
      <Button variant="ghost" size="sm" asChild className="w-fit">
        <Link href={backHref}>
          <ArrowLeft aria-hidden="true" />
          Terug
        </Link>
      </Button>
      {children}
    </div>
  );
}

function LoginCard({
  student,
  className,
  origin,
  host,
}: {
  student: CardStudent;
  className?: string;
  origin: string;
  host: string;
}) {
  const qrValue = origin
    ? `${origin}/inloggen?nummer=${encodeURIComponent(student.studentNumber)}`
    : "";
  return (
    <article data-login-card className="login-card login-paper text-foreground">
      <header className="flex items-center justify-between gap-2">
        <span className="inline-flex items-center gap-[1.6mm]">
          <LogoMark className="size-[6.5mm]" />
          <span className="font-display-wide text-[4.2mm] leading-none font-bold tracking-tight">
            Pensuma
          </span>
        </span>
        <span className="truncate text-[2.6mm] font-medium tracking-[0.12em] text-muted-foreground uppercase">
          {className ? `Inlogkaart · ${className}` : "Inlogkaart"}
        </span>
      </header>

      <div className="flex min-h-0 flex-1 items-stretch gap-[4mm]">
        <div className="flex min-w-0 flex-1 flex-col justify-between gap-[2mm]">
          <p className="line-clamp-2 text-[5mm] leading-tight font-semibold">
            {student.name}
          </p>
          <dl className="flex flex-col gap-[1.8mm]">
            <div className="flex flex-col gap-[0.6mm]">
              <dt className="text-[2.5mm] font-medium tracking-[0.1em] text-muted-foreground uppercase">
                Leerlingnummer
              </dt>
              <dd className="font-mono text-[5.2mm] leading-none font-medium tabular-nums">
                {student.studentNumber}
              </dd>
            </div>
            <div className="flex flex-col gap-[0.6mm]">
              <dt className="text-[2.5mm] font-medium tracking-[0.1em] text-muted-foreground uppercase">
                Pincode
              </dt>
              <dd className="login-card-pin font-mono font-medium tabular-nums">
                {student.pin ? formatPin(student.pin) : "––– –––"}
              </dd>
            </div>
          </dl>
        </div>
        <div className="flex shrink-0 flex-col items-center justify-end gap-[1mm]">
          {qrValue ? (
            <QrCode
              value={qrValue}
              type="svg"
              size={100}
              bordered={false}
              marginSize={0}
              color="#000000"
              bgColor="#ffffff"
              extra={null}
              className="gap-0"
            />
          ) : (
            <span className="block size-[100px]" />
          )}
          <span className="text-[2.2mm] text-muted-foreground">
            Scan om in te loggen
          </span>
        </div>
      </div>

      <footer className="flex flex-col gap-[0.6mm] border-t border-dashed border-border pt-[1.8mm] text-[2.6mm] leading-snug text-muted-foreground">
        <span className="break-all">
          Inloggen op{" "}
          <span className="font-mono font-medium text-foreground">
            {host ? `${host}/inloggen` : "/inloggen"}
          </span>
        </span>
        <span>Houd je pincode geheim. Kwijt? Vraag je docent.</span>
      </footer>
    </article>
  );
}
