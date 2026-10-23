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
