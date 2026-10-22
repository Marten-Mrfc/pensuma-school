/**
 * Code fingerprints for the similarity check (code vergelijken). Pure module.
 *
 * 1. Normalise the token stream (tokenizePython): keywords, builtins and
 *    operators keep their value; other names → "V", numbers → "N",
 *    strings → "S"; comments are dropped; a newline becomes ";", an indent
 *    "{" and a dedent "}". Renaming variables therefore changes nothing.
 * 2. Hash every k-gram (k = 5 tokens) with FNV-1a (32 bit).
 * 3. Winnowing (Schleimer, Wilkerson & Aiken 2003): in every window of
 *    w = 4 consecutive k-gram hashes keep the minimum (the rightmost one on
 *    ties). The kept hashes are the fingerprints.
 */
import { BUILTINS, tokenizePython } from "@/lib/python/tokenize";

export const KGRAM_SIZE = 5;
export const WINDOW_SIZE = 4;

export type NormalizedToken = {
  value: string;
  /** 1-based source line. */
  line: number;
};

/** Structural tokens that don't count towards the size of an answer. */
const STRUCTURAL = new Set([";", "{", "}"]);

export function normalizeTokens(src: string): NormalizedToken[] {
  const out: NormalizedToken[] = [];
  for (const t of tokenizePython(src).tokens) {
    switch (t.kind) {
      case "comment":
        break;
      case "keyword":
      case "op":
        out.push({ value: t.value, line: t.line });
        break;
      case "name":
        out.push({
          value: BUILTINS.has(t.value) ? t.value : "V",
          line: t.line,
        });
        break;
      case "number":
        out.push({ value: "N", line: t.line });
        break;
      case "string":
        out.push({ value: "S", line: t.line });
        break;
      case "newline":
        out.push({ value: ";", line: t.line });
        break;
      case "indent":
        out.push({ value: "{", line: t.line });
        break;
      case "dedent":
        out.push({ value: "}", line: t.line });
        break;
    }
  }
  return out;
}

/** Number of tokens that carry content (no newlines/indentation). */
export function meaningfulTokenCount(tokens: readonly NormalizedToken[]) {
  let n = 0;
  for (const t of tokens) if (!STRUCTURAL.has(t.value)) n++;
  return n;
}

/** FNV-1a, 32 bit, over the UTF-16 code units of `text`. */
export function fnv1a32(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash >>> 0;
}

export type KGram = {
  hash: number;
  /** Index of the first token. */
  start: number;
  lineFrom: number;
  lineTo: number;
};

/** Hashes of all k-grams of a token stream (none when it is shorter than k). */
export function kgramHashes(
  tokens: readonly NormalizedToken[],
  k = KGRAM_SIZE,
): KGram[] {
  const grams: KGram[] = [];
  for (let i = 0; i + k <= tokens.length; i++) {
    let text = "";
    let lineFrom = tokens[i].line;
    let lineTo = tokens[i].line;
    for (let j = i; j < i + k; j++) {
      // \u0001 separates tokens so "a b" ≠ "ab".
      text += `${tokens[j].value}\u0001`;
      lineFrom = Math.min(lineFrom, tokens[j].line);
      lineTo = Math.max(lineTo, tokens[j].line);
    }
    grams.push({ hash: fnv1a32(text), start: i, lineFrom, lineTo });
  }
  return grams;
}

/**
 * Winnowing: indices (into `hashes`) of the selected fingerprints. In each
 * window of `w` hashes the minimum is chosen, the rightmost on ties; a
 * position is recorded once. Fewer hashes than `w` → one window.
 */
export function winnow(hashes: readonly number[], w = WINDOW_SIZE): number[] {
  if (hashes.length === 0) return [];
  const selected: number[] = [];
  const windows = Math.max(1, hashes.length - w + 1);
  let last = -1;
  for (let start = 0; start < windows; start++) {
    const end = Math.min(hashes.length, start + w);
    let minIndex = start;
    for (let i = start; i < end; i++) {
      if (hashes[i] <= hashes[minIndex]) minIndex = i;
    }
    if (minIndex !== last) {
      selected.push(minIndex);
      last = minIndex;
    }
  }
  return selected;
}

export type Fingerprint = {
  tokens: NormalizedToken[];
  /** Content tokens (for the minimum-size rule). */
  size: number;
  kgrams: KGram[];
  /** Selected fingerprint hashes. */
  hashes: Set<number>;
  /** Normalised token sequence, for "same structure" detection. */
  structure: string;
};

export function fingerprint(
  src: string,
  k = KGRAM_SIZE,
  w = WINDOW_SIZE,
): Fingerprint {
  const tokens = normalizeTokens(src);
  const kgrams = kgramHashes(tokens, k);
  const all = kgrams.map((g) => g.hash);
  const hashes = new Set(winnow(all, w).map((i) => all[i]));
  return {
    tokens,
    size: meaningfulTokenCount(tokens),
    kgrams,
    hashes,
    structure: tokens.map((t) => t.value).join(" "),
  };
}

/** Code with trailing whitespace and blank lines removed (for "identiek"). */
export function canonicalText(src: string): string {
  return src
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((l) => l.replace(/\s+$/, ""))
    .filter((l) => l !== "")
    .join("\n");
}
