"use client";

import { ScrollRegion } from "@/components/a11y/scroll-region";
import { DATA_CATEGORIES, formatSubjects } from "@/lib/privacy/register";
import type { PrivacySettings } from "@/lib/privacy/settings";
import { cn } from "@/lib/utils";
import {
  settingsFromPublicInfo,
  usePublicPrivacyInfo,
} from "./use-public-privacy-info";

export interface DataInventoryTableProps {
  /** Settings for the retention column; omitted = the public settings. */
  settings?: PrivacySettings;
  /** Also show the legal basis and the database tables (teacher view). */
  detailed?: boolean;
  caption?: string;
  className?: string;
}

/**
 * Every data category Pensuma processes (from DATA_CATEGORIES): a real
 * table on wider screens, stacked cards on phones.
 */
export function DataInventoryTable({
  settings,
  detailed = false,
  caption = "Welke gegevens Pensuma verwerkt",
  className,
}: DataInventoryTableProps) {
  const publicInfo = usePublicPrivacyInfo();
  const effective = settings ?? settingsFromPublicInfo(publicInfo.data);
  const rows = DATA_CATEGORIES.map((c) => ({
    ...c,
    retentionText: c.retention(effective),
  }));

  return (
    <div className={cn("flex flex-col gap-3", className)}>
      <div className="hidden overflow-hidden rounded-xl border bg-card md:block">
        <ScrollRegion label={caption}>
          <table className="w-full min-w-[720px] border-collapse text-left text-sm">
            <caption className="sr-only">{caption}</caption>
            <thead className="bg-muted/50 text-xs tracking-wide text-muted-foreground uppercase">
              <tr>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Gegevens
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Wat precies
                </th>
                <th scope="col" className="px-4 py-3 font-semibold">
                  Waarom
                </th>
                {detailed ? (
                  <th scope="col" className="px-4 py-3 font-semibold">
                    Grondslag
                  </th>
                ) : null}
                <th scope="col" className="px-4 py-3 font-semibold">
                  Bewaartermijn
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {rows.map((c) => (
                <tr key={c.id} className="align-top">
                  <th
                    scope="row"
                    className="w-48 px-4 py-3.5 font-semibold text-foreground"
                  >
                    {c.label}
                    <span className="mt-1 block text-xs font-normal text-muted-foreground">
                      {formatSubjects(c.subjects)}
                    </span>
                    {detailed ? (
                      <span className="mt-1 block font-mono text-[0.7rem] font-normal break-words text-muted-foreground">
                        {[...c.tables, ...(c.sharedTables ?? [])].join(", ") ||
                          "geen databasetabel"}
                      </span>
                    ) : null}
                  </th>
                  <td className="px-4 py-3.5 text-muted-foreground">
                    {c.examples}
                  </td>
                  <td className="px-4 py-3.5 text-muted-foreground">
                    {c.purpose}
                  </td>
                  {detailed ? (
                    <td className="px-4 py-3.5 text-muted-foreground">
                      {c.legalBasis}
                    </td>
                  ) : null}
                  <td className="px-4 py-3.5 text-foreground">
                    {c.retentionText}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </ScrollRegion>
      </div>

      <ul className="flex flex-col gap-3 md:hidden" aria-label={caption}>
        {rows.map((c) => (
          <li key={c.id} className="rounded-xl border bg-card p-4">
            <p className="font-semibold text-foreground">{c.label}</p>
            <p className="text-xs text-muted-foreground">
              {formatSubjects(c.subjects)}
            </p>
            <dl className="mt-3 flex flex-col gap-2.5 text-sm">
              <div>
                <dt className="text-xs font-medium text-muted-foreground">
                  Wat precies
                </dt>
                <dd>{c.examples}</dd>
              </div>
              <div>
                <dt className="text-xs font-medium text-muted-foreground">
                  Waarom
                </dt>
                <dd>{c.purpose}</dd>
              </div>
              {detailed ? (
                <div>
                  <dt className="text-xs font-medium text-muted-foreground">
                    Grondslag
                  </dt>
                  <dd>{c.legalBasis}</dd>
                </div>
              ) : null}
              <div>
                <dt className="text-xs font-medium text-muted-foreground">
                  Bewaartermijn
                </dt>
                <dd>{c.retentionText}</dd>
              </div>
            </dl>
          </li>
        ))}
      </ul>
    </div>
  );
}
