"use client";

/**
 * The school-specific bits of the privacy statement (contacts, retention
 * numbers). Everything else on /privacy is prerendered; these fill in
 * after the page has loaded. Missing values never show an empty
 * placeholder.
 */
import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  autoDeleteNotice,
  formatDays,
  formatMonths,
} from "@/lib/privacy/retention";
import type { PublicPrivacyInfo } from "@/lib/privacy/settings";
import { cn } from "@/lib/utils";
import {
  NO_CONTACT_FALLBACK,
  usePublicPrivacyInfo,
} from "./use-public-privacy-info";

/** Inline placeholder (a <span>, so it may sit inside a paragraph). */
export function ValueSkeleton({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "inline-block h-[1em] w-24 rounded bg-muted align-middle motion-safe:animate-pulse",
        className,
      )}
    />
  );
}

function WithInfo({
  children,
  skeleton,
}: {
  children: (info: PublicPrivacyInfo | undefined) => ReactNode;
  skeleton?: ReactNode;
}) {
  const query = usePublicPrivacyInfo();
  if (query.isPending) return <>{skeleton ?? <ValueSkeleton />}</>;
  return <>{children(query.data)}</>;
}

const linkClass =
  "font-medium text-primary underline underline-offset-[3px] hover:no-underline focus-visible:rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export function MailLink({ email }: { email: string }) {
  return (
    <a href={`mailto:${email}`} className={linkClass}>
      {email}
    </a>
  );
}

/** "… of mail privacy@school.nl." / "… of neem contact op met je school." */
export function AskSentence() {
  return (
    <WithInfo>
      {(info) =>
        info?.school.privacyEmail ? (
          <>
            Vraag het je docent of mail{" "}
            <MailLink email={info.school.privacyEmail} />.
          </>
        ) : (
          <>Vraag het je docent of neem contact op met je school.</>
        )
      }
    </WithInfo>
  );
}

/** The privacy e-mail address as a link, or the fallback sentence. */
export function PrivacyEmail() {
  return (
    <WithInfo>
      {(info) =>
        info?.school.privacyEmail ? (
          <MailLink email={info.school.privacyEmail} />
        ) : (
          NO_CONTACT_FALLBACK
        )
      }
    </WithInfo>
  );
}

type RetentionField =
  | "attemptEventsDays"
  | "attemptsMonths"
  | "inactiveStudentMonths"
  | "auditLogMonths"
  | "backupDays";

const RETENTION_DEFAULTS: Record<RetentionField, number> = {
  attemptEventsDays: 90,
  attemptsMonths: 24,
  inactiveStudentMonths: 12,
  auditLogMonths: 24,
  backupDays: 30,
};

/** "90 dagen", "24 maanden" from the school's settings. */
export function RetentionValue({ field }: { field: RetentionField }) {
  return (
    <WithInfo skeleton={<ValueSkeleton className="w-16" />}>
      {(info) => {
        const value =
          field === "backupDays"
            ? (info?.processor.backupDays ?? RETENTION_DEFAULTS.backupDays)
            : (info?.retention[field] ?? RETENTION_DEFAULTS[field]);
        return (
          <strong className="font-semibold text-foreground">
            {field.endsWith("Days") ? formatDays(value) : formatMonths(value)}
          </strong>
        );
      }}
    </WithInfo>
  );
}

/**
 * Note shown whenever attempts and old accounts are not deleted
 * automatically: the school has not confirmed the periods yet, or confirmed
 * them with automatic deletion switched off (the engine's own condition).
 */
export function RetentionConfirmationNote() {
  return (
    <WithInfo skeleton={null}>
      {(info) => {
        const notice = info ? autoDeleteNotice(info.retention) : null;
        return notice ? (
          <p className="rounded-xl border bg-card px-4 py-3 text-sm text-foreground">
            {notice}
          </p>
        ) : null;
      }}
    </WithInfo>
  );
}

/**
 * " (zie de toelichting hieronder)" after a retention period that is not
 * applied automatically (see RetentionConfirmationNote); nothing otherwise.
 */
export function RetentionNoticeRef() {
  return (
    <WithInfo skeleton={null}>
      {(info) =>
        info && autoDeleteNotice(info.retention) ? (
          <> (zie de toelichting hieronder)</>
        ) : null
      }
    </WithInfo>
  );
}

export function HostingLocation() {
  return (
    <WithInfo skeleton={<ValueSkeleton className="w-32" />}>
      {(info) => (
        <strong className="font-semibold text-foreground">
          {info?.processor.hostingLocation?.trim() || "Nederland (EU)"}
        </strong>
      )}
    </WithInfo>
  );
}

/** " (Naam)" after "de beheerder", or nothing. */
export function ProcessorName() {
  return (
    <WithInfo skeleton={null}>
      {(info) => (info?.processor.name ? <> ({info.processor.name})</> : null)}
    </WithInfo>
  );
}

/** "via privacy@school.nl" or "bij je school" (continues a sentence). */
export function ContactPhrase() {
  return (
    <WithInfo>
      {(info) =>
        info?.school.privacyEmail ? (
          <>
            via <MailLink email={info.school.privacyEmail} />
          </>
        ) : (
          <>bij je school</>
        )
      }
    </WithInfo>
  );
}

function Row({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5 border-b py-3 last:border-b-0 sm:flex-row sm:gap-6">
      <dt className="shrink-0 text-sm font-medium text-muted-foreground sm:w-56">
        {term}
      </dt>
      <dd className="min-w-0 text-[0.95rem] break-words text-foreground">
        {children}
      </dd>
    </div>
  );
}

function NameAndMail({ name, email }: { name: string; email: string }) {
  if (!name && !email) return <>{NO_CONTACT_FALLBACK}</>;
  return (
    <span className="flex flex-col gap-0.5">
      {name ? <span>{name}</span> : null}
      {email ? (
        <span>
          <MailLink email={email} />
        </span>
      ) : null}
    </span>
  );
}

function ContactSkeleton() {
  return (
    <div className="flex flex-col gap-3 py-2" aria-hidden="true">
      {[56, 40, 64, 48].map((w) => (
        <Skeleton key={w} className="h-5" style={{ width: `${w}%` }} />
      ))}
    </div>
  );
}

/** Section "Wie is verantwoordelijk?": controller, DPO, processor. */
export function ControllerDetails() {
  return (
    <WithInfo skeleton={<ContactSkeleton />}>
      {(info) => (
        <dl className="rounded-xl border bg-card px-4 sm:px-5">
          <Row term="School">{info?.school.name || NO_CONTACT_FALLBACK}</Row>
          <Row term="Verwerkingsverantwoordelijke (bevoegd gezag)">
            {info?.school.authority ||
              info?.school.name ||
              "Het bevoegd gezag van je school (de stichting of vereniging)."}
          </Row>
          <Row term="Functionaris gegevensbescherming (FG)">
            <NameAndMail
              name={info?.dpo.name ?? ""}
              email={info?.dpo.email ?? ""}
            />
          </Row>
          <Row term="Beheerder van Pensuma (verwerker)">
            {info?.processor.name || info?.processor.email ? (
              <NameAndMail
                name={info?.processor.name ?? ""}
                email={info?.processor.email ?? ""}
              />
            ) : (
              "De ICT-afdeling of een beheerder die de school daarvoor inschakelt."
            )}
          </Row>
        </dl>
      )}
    </WithInfo>
  );
}

/** Section "Contact": privacy contact, DPO, privacy policy link. */
export function ContactDetails() {
  return (
    <WithInfo skeleton={<ContactSkeleton />}>
      {(info) => (
        <dl className="rounded-xl border bg-card px-4 sm:px-5">
          <Row term="Vragen over privacy">
            {info?.school.privacyEmail ? (
              <MailLink email={info.school.privacyEmail} />
            ) : (
              NO_CONTACT_FALLBACK
            )}
          </Row>
          <Row term="Functionaris gegevensbescherming (FG)">
            <NameAndMail
              name={info?.dpo.name ?? ""}
              email={info?.dpo.email ?? ""}
            />
          </Row>
          {info?.school.policyUrl ? (
            <Row term="Privacyreglement">
              <a
                href={info.school.policyUrl}
                className={linkClass}
                rel="noopener noreferrer"
              >
                Privacyreglement van {info.school.name || "de school"}
              </a>
            </Row>
          ) : null}
        </dl>
      )}
    </WithInfo>
  );
}

const longDate = new Intl.DateTimeFormat("nl-NL", {
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: "Europe/Amsterdam",
});

/** "Laatst bijgewerkt: 22 oktober 2026". */
export function UpdatedAt({ versionDate }: { versionDate: string }) {
  return (
    <WithInfo skeleton={<ValueSkeleton className="w-32" />}>
      {(info) => {
        const version = new Date(`${versionDate}T12:00:00Z`);
        const updated = info?.updatedAt ? new Date(info.updatedAt) : null;
        const latest = updated && updated > version ? updated : version;
        return (
          <time dateTime={latest.toISOString()}>{longDate.format(latest)}</time>
        );
      }}
    </WithInfo>
  );
}
