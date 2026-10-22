/**
 * Pairwise similarity of code submissions (one question). Pure module.
 *
 * Score = containment |A ∩ B| / min(|A|, |B|) over the winnowed fingerprints
 * (so a short answer that is fully inside a longer one scores high), plus
 * the Jaccard index |A ∩ B| / |A ∪ B| for reference.
 *
 * Ignored fingerprints:
 *  - everything in the starter code;
 *  - fingerprints present in more than `commonFraction` of the submissions
 *    when there are at least 6 (the "obvious" solution everybody writes).
 *
 * The model solution (optional) takes part as the pseudo-id "solution".
 * Nothing is stored: the teacher's screen computes this on demand.
 */
import {
  canonicalText,
  type Fingerprint,
  fingerprint,
  KGRAM_SIZE,
  kgramHashes,
  normalizeTokens,
  WINDOW_SIZE,
} from "./fingerprint";

export const SOLUTION_ID = "solution";

export type Submission = { id: string; code: string };

export type CompareOptions = {
  starterCode?: string;
  solution?: string | null;
  /** Answers with fewer content tokens are skipped. Default 25. */
  minTokens?: number;
  /** Minimum score (containment) for a pair to be reported. Default 0.7. */
  threshold?: number;
  /** Share of submissions above which a fingerprint is "common". Default 0.5. */
  commonFraction?: number;
  /** Only the first N submissions are analysed. Default 400. */
  maxSubmissions?: number;
  k?: number;
  w?: number;
};

export type SimilarityPair = {
  a: string;
  b: string;
  score: number;
  jaccard: number;
  /** Same normalised token sequence (only names/values differ). */
  identicalStructure: boolean;
  /** Same code (ignoring trailing spaces and blank lines). */
  exact: boolean;
  /** 1-based lines of A / B covered by shared fingerprints. */
  linesA: number[];
  linesB: number[];
};

export type CompareResult = {
  /** Submissions that were compared (the solution not included). */
  analyzed: number;
  /** Ids of submissions skipped because they are too short. */
  skippedShort: string[];
  truncated: boolean;
  pairs: SimilarityPair[];
};

type Prepared = {
  id: string;
  code: string;
  fp: Fingerprint;
  effective: Set<number>;
};

/** Trimmed, non-empty lines of the starter code (never highlighted). */
function lineSet(code: string): Set<string> {
  return new Set(
    code
      .replace(/\r\n?/g, "\n")
      .split("\n")
      .map((l) => l.trim())
      .filter(Boolean),
  );
}

/**
 * Lines covered by the k-grams whose hash is in `shared`, except lines that
 * also appear in the starter code.
 */
function coveredLines(
  item: Prepared,
  shared: Set<number>,
  starterLines: Set<string>,
): number[] {
  const text = item.code.replace(/\r\n?/g, "\n").split("\n");
  const lines = new Set<number>();
  for (const g of item.fp.kgrams) {
    if (!shared.has(g.hash)) continue;
    for (let l = g.lineFrom; l <= g.lineTo; l++) {
      const content = text[l - 1]?.trim() ?? "";
      if (content && !starterLines.has(content)) lines.add(l);
    }
  }
  return [...lines].sort((x, y) => x - y);
}

function intersect(a: Set<number>, b: Set<number>): Set<number> {
  const [small, large] = a.size <= b.size ? [a, b] : [b, a];
  const out = new Set<number>();
  for (const h of small) if (large.has(h)) out.add(h);
  return out;
}

function pairOf(
  x: Prepared,
  y: Prepared,
  starterLines: Set<string>,
): SimilarityPair | null {
  const minSize = Math.min(x.effective.size, y.effective.size);
  if (minSize === 0) return null;
  const shared = intersect(x.effective, y.effective);
  const union = x.effective.size + y.effective.size - shared.size;
  const exact = canonicalText(x.code) === canonicalText(y.code);
  return {
    a: x.id,
    b: y.id,
    score: shared.size / minSize,
    jaccard: union ? shared.size / union : 0,
    identicalStructure: exact || x.fp.structure === y.fp.structure,
    exact,
    linesA: coveredLines(x, shared, starterLines),
    linesB: coveredLines(y, shared, starterLines),
  };
}

/** All k-gram hashes of a piece of code (for subtracting starter code). */
function allHashes(code: string, k: number): Set<number> {
  return new Set(kgramHashes(normalizeTokens(code), k).map((g) => g.hash));
}

export function compareSubmissions(
  subs: readonly Submission[],
  options: CompareOptions = {},
): CompareResult {
  const {
    starterCode = "",
    solution = null,
    minTokens = 25,
    threshold = 0.7,
    commonFraction = 0.5,
    maxSubmissions = 400,
    k = KGRAM_SIZE,
    w = WINDOW_SIZE,
  } = options;

  const truncated = subs.length > maxSubmissions;
  const starter = starterCode.trim() ? allHashes(starterCode, k) : new Set();
  const starterLines = lineSet(starterCode);

  const skippedShort: string[] = [];
  const prepared: Prepared[] = [];
  for (const sub of subs.slice(0, maxSubmissions)) {
    const fp = fingerprint(sub.code, k, w);
    const effective = new Set([...fp.hashes].filter((h) => !starter.has(h)));
    if (fp.size < minTokens || effective.size === 0) {
      skippedShort.push(sub.id);
      continue;
    }
    prepared.push({ id: sub.id, code: sub.code, fp, effective });
  }

  // Fingerprints (almost) everybody has are not evidence of copying.
  if (prepared.length >= 6) {
    const counts = new Map<number, number>();
    for (const p of prepared)
      for (const h of p.effective) counts.set(h, (counts.get(h) ?? 0) + 1);
    const limit = commonFraction * prepared.length;
    const common = new Set(
      [...counts].filter(([, c]) => c > limit).map(([h]) => h),
    );
    if (common.size) {
      for (const p of prepared)
        p.effective = new Set([...p.effective].filter((h) => !common.has(h)));
    }
  }

  const candidates = [...prepared];
  if (solution?.trim()) {
    const fp = fingerprint(solution, k, w);
    const effective = new Set([...fp.hashes].filter((h) => !starter.has(h)));
    if (fp.size >= minTokens && effective.size > 0) {
      candidates.push({ id: SOLUTION_ID, code: solution, fp, effective });
    }
  }

  const pairs: SimilarityPair[] = [];
  for (let i = 0; i < candidates.length; i++) {
    for (let j = i + 1; j < candidates.length; j++) {
      const x = candidates[i];
      const y = candidates[j];
      // Cheap upper bound before computing line coverage.
      const minSize = Math.min(x.effective.size, y.effective.size);
      if (minSize === 0) continue;
      let shared = 0;
      const [small, large] =
        x.effective.size <= y.effective.size
          ? [x.effective, y.effective]
          : [y.effective, x.effective];
      for (const h of small) if (large.has(h)) shared++;
      if (shared / minSize < threshold) continue;
      const pair = pairOf(x, y, starterLines);
      if (pair) pairs.push(pair);
    }
  }
  pairs.sort(
    (p, q) =>
      q.score - p.score || q.jaccard - p.jaccard || (p.a < q.a ? -1 : 1),
  );

  return {
    analyzed: prepared.length,
    skippedShort,
    truncated,
    pairs,
  };
}

/**
 * One pair in detail (for the side-by-side view): scores and the matched
 * lines, with the starter code subtracted.
 */
export function comparePair(
  codeA: string,
  codeB: string,
  options: Pick<CompareOptions, "starterCode" | "k" | "w"> = {},
): Omit<SimilarityPair, "a" | "b"> {
  const { starterCode = "", k = KGRAM_SIZE, w = WINDOW_SIZE } = options;
  const starter = starterCode.trim() ? allHashes(starterCode, k) : new Set();
  const prep = (id: string, code: string): Prepared => {
    const fp = fingerprint(code, k, w);
    return {
      id,
      code,
      fp,
      effective: new Set([...fp.hashes].filter((h) => !starter.has(h))),
    };
  };
  const pair = pairOf(prep("a", codeA), prep("b", codeB), lineSet(starterCode));
  if (pair) {
    const { a: _a, b: _b, ...rest } = pair;
    return rest;
  }
  const exact = canonicalText(codeA) === canonicalText(codeB);
  return {
    score: 0,
    jaccard: 0,
    identicalStructure: exact,
    exact,
    linesA: [],
    linesB: [],
  };
}

/** Collapse sorted line numbers into ranges: [1,2,3,7] → [[1,3],[7,7]]. */
export function toRanges(lines: readonly number[]): [number, number][] {
  const ranges: [number, number][] = [];
  for (const l of lines) {
    const last = ranges[ranges.length - 1];
    if (last && l === last[1] + 1) last[1] = l;
    else if (!last || l > last[1]) ranges.push([l, l]);
  }
  return ranges;
}
