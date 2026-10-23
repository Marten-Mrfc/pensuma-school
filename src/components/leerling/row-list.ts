/**
 * Lists of row links in one bordered card (Afgerond on the dashboard,
 * Resultaten). The card does not clip its rows (no overflow-hidden), so a
 * row's focus indicator stays whole: an inset ring in normal mode, and the
 * global outline in forced-colors mode. The first and last rows round
 * their own corners instead, so hover and focus backgrounds follow the
 * card's shape.
 */
export const ROW_LIST_CLASS = "divide-y rounded-2xl border bg-card shadow-xs";

export const ROW_LINK_CLASS =
  "group flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors outline-none hover:bg-accent/50 focus-visible:bg-accent/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset [li:first-child>&]:rounded-t-2xl [li:last-child>&]:rounded-b-2xl";
