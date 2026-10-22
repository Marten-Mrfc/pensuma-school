/**
 * Classical item analysis (toetsanalyse) for one afname. Pure module.
 *
 * Per item (question):
 *  - p    mean score / max (0 = nobody right, 1 = everybody right)
 *  - sd   standard deviation of the item score (in points, n − 1)
 *  - rit  Pearson correlation item score ↔ total score
 *  - rir  Pearson correlation item score ↔ total score without this item
 * Per test: mean and sd of the total score and Cronbach's alpha.
 *
 * Feed it only submitted attempts. Items with a maximum of 0 (dropped
 * questions) are excluded. Degenerate statistics (n < 2, zero variance,
 * fewer than 2 items) are null.
 */

export type ItemScore = { score: number; max: number };

/** One student's (representative, submitted) attempt. */
export type ItemAnalysisRow = {
  items: Record<string, ItemScore | null | undefined>;
};

export type ItemStats = {
  questionId: string;
  /** Number of students. */
  n: number;
  /** Maximum points of the item (0 = excluded). */
  max: number;
  excluded: boolean;
  /** Mean item score in points. */
  mean: number | null;
  p: number | null;
  sd: number | null;
  rit: number | null;
  rir: number | null;
};

export type TestStats = {
  n: number;
  /** Number of items that count (max > 0). */
  k: number;
  maxTotal: number;
  mean: number | null;
  sd: number | null;
  alpha: number | null;
};

export type ItemAnalysis = { test: TestStats; items: ItemStats[] };

const EPS = 1e-12;

export function mean(xs: readonly number[]): number | null {
  if (!xs.length) return null;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

/** Sample variance (n − 1); null for fewer than 2 values. */
export function variance(xs: readonly number[]): number | null {
  if (xs.length < 2) return null;
  const m = mean(xs) ?? 0;
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return s / (xs.length - 1);
}

export function stdDev(xs: readonly number[]): number | null {
  const v = variance(xs);
  return v == null ? null : Math.sqrt(v);
}

/** Pearson correlation; null when n < 2 or either side has no variance. */
export function pearson(
  xs: readonly number[],
  ys: readonly number[],
): number | null {
  const n = Math.min(xs.length, ys.length);
  if (n < 2) return null;
  const mx = mean(xs.slice(0, n)) ?? 0;
  const my = mean(ys.slice(0, n)) ?? 0;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx;
    const dy = ys[i] - my;
    sxy += dx * dy;
    sxx += dx * dx;
    syy += dy * dy;
  }
  if (sxx < EPS || syy < EPS) return null;
  const r = sxy / Math.sqrt(sxx * syy);
  return Math.max(-1, Math.min(1, r));
}

/** Cronbach's alpha from item variances and the total variance. */
export function cronbachAlpha(
  itemVariances: readonly number[],
  totalVariance: number | null,
): number | null {
  const k = itemVariances.length;
  if (k < 2 || totalVariance == null || totalVariance < EPS) return null;
  const sum = itemVariances.reduce((s, v) => s + v, 0);
  return (k / (k - 1)) * (1 - sum / totalVariance);
}

/**
 * Analyse the items `questionIds` over `rows`. A missing answer counts as
 * 0 points; a score is clamped to 0..max.
 */
export function analyzeItems(
  rows: readonly ItemAnalysisRow[],
  questionIds: readonly string[],
): ItemAnalysis {
  const n = rows.length;
  const maxima = new Map<string, number>();
  for (const qid of questionIds) {
    let max = 0;
    for (const r of rows) max = Math.max(max, r.items[qid]?.max ?? 0);
    maxima.set(qid, max);
  }
  const included = questionIds.filter((q) => (maxima.get(q) ?? 0) > 0);

  const scoresByItem = new Map<string, number[]>();
  for (const qid of included) {
    const max = maxima.get(qid) ?? 0;
    scoresByItem.set(
      qid,
      rows.map((r) => {
        const s = r.items[qid]?.score ?? 0;
        return Number.isFinite(s) ? Math.min(max, Math.max(0, s)) : 0;
      }),
    );
  }
  const totals = rows.map((_, i) =>
    included.reduce((s, qid) => s + (scoresByItem.get(qid)?.[i] ?? 0), 0),
  );

  const items: ItemStats[] = questionIds.map((qid) => {
    const max = maxima.get(qid) ?? 0;
    const scores = scoresByItem.get(qid);
    if (!scores) {
      return {
        questionId: qid,
        n,
        max,
        excluded: true,
        mean: null,
        p: null,
        sd: null,
        rit: null,
        rir: null,
      };
    }
    const m = mean(scores);
    const rest = totals.map((t, i) => t - scores[i]);
    return {
      questionId: qid,
      n,
      max,
      excluded: false,
      mean: m,
      p: m == null ? null : m / max,
      sd: stdDev(scores),
      rit: pearson(scores, totals),
      rir: included.length < 2 ? null : pearson(scores, rest),
    };
  });

  const itemVariances = included.map(
    (qid) => variance(scoresByItem.get(qid) ?? []) ?? 0,
  );
  const totalVariance = variance(totals);
  return {
    test: {
      n,
      k: included.length,
      maxTotal: included.reduce((s, q) => s + (maxima.get(q) ?? 0), 0),
      mean: mean(totals),
      sd: totalVariance == null ? null : Math.sqrt(totalVariance),
      alpha: n < 2 ? null : cronbachAlpha(itemVariances, totalVariance),
    },
    items,
  };
}
