/**
 * Pure helpers for the student dashboard (src/components/leerling/
 * dashboard.tsx), kept apart so they can be unit tested.
 */

type DashboardItemLike = {
  inProgress: { attemptId: string } | null;
  lastAttempt: { attemptId: string } | null;
};

/** Ids of the attempts still running, from every dashboard list. */
export function inProgressAttemptIds(
  lists: readonly (readonly DashboardItemLike[])[],
): string[] {
  const ids: string[] = [];
  for (const list of lists) {
    for (const item of list) {
      if (item.inProgress) ids.push(item.inProgress.attemptId);
    }
  }
  return ids;
}

/**
 * Which answer backups the dashboard keeps, as a stable key for an effect:
 * the sorted ids of the running attempts ("" when none), or null when the
 * data is not fresh. Only data fetched since the page opened counts:
 * cached data could miss an attempt started a moment ago, and pruning on
 * it would drop that attempt's backup.
 */
export function backupKeepKey(query: {
  isFetchedAfterMount: boolean;
  data?: {
    open: readonly DashboardItemLike[];
    upcoming: readonly DashboardItemLike[];
    finished: readonly DashboardItemLike[];
  };
}): string | null {
  if (!query.isFetchedAfterMount || !query.data) return null;
  const { open, upcoming, finished } = query.data;
  return inProgressAttemptIds([open, upcoming, finished]).sort().join(",");
}

/** The attempt ids in a `backupKeepKey`. */
export function keepKeyIds(key: string): string[] {
  return key ? key.split(",") : [];
}

export type FinishedEmptyCopy = {
  title: string;
  description: string;
  /** Offer a link to Resultaten (hand-ins exist, just not here). */
  linkToResults: boolean;
};

/**
 * Text for an empty "Afgerond" section. A toets or oefening with attempts
 * left stays under "Open toetsen" even after a hand-in, so "Afgerond" can
 * be empty while Resultaten is not: then say where those hand-ins are.
 */
export function finishedEmptyCopy(
  open: readonly DashboardItemLike[],
): FinishedEmptyCopy {
  if (open.some((item) => item.lastAttempt != null)) {
    return {
      title: "Nog niets afgerond",
      description:
        "Toetsen en oefeningen waarbij je nog een poging over hebt, blijven bij Open toetsen. Al je ingeleverde pogingen vind je bij Resultaten.",
      linkToResults: true,
    };
  }
  return {
    title: "Nog niets afgerond",
    description:
      "Toetsen die klaar of gesloten zijn verschijnen hier, met je resultaat zodra dat beschikbaar is.",
    linkToResults: false,
  };
}
