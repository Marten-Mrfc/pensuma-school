/**
 * Topic tags ("onderwerpen") for the question bank. Pure module, shared by
 * the question editor, the bank filters and the routers.
 */

/** Maximum length of one tag (after normalising). */
export const MAX_TAG_LENGTH = 30;
/** Maximum number of tags on one question. */
export const MAX_TAGS_PER_QUESTION = 10;

/** Topics teachers usually need for informatica (Python). */
export const SUGGESTED_TAGS = [
  "variabelen",
  "invoer en uitvoer",
  "datatypes",
  "rekenen",
  "voorwaarden",
  "for-lus",
  "while-lus",
  "lijsten",
  "strings",
  "functies",
  "dictionaries",
  "bestanden",
  "foutafhandeling",
  "algoritmen",
  "zoeken en sorteren",
  "recursie",
] as const;

/**
 * Trim, collapse inner whitespace, lower-case and cut to 30 characters.
 * Returns "" for a tag with no visible characters.
 */
export function normalizeTag(tag: string): string {
  return tag
    .normalize("NFC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase("nl-NL")
    .slice(0, MAX_TAG_LENGTH)
    .trim();
}

/**
 * Normalise a list of tags: empty tags and duplicates are dropped (first
 * occurrence wins) and at most 10 are kept.
 */
export function normalizeTags(tags: readonly string[]): string[] {
  const out: string[] = [];
  for (const raw of tags) {
    const tag = normalizeTag(raw);
    if (tag && !out.includes(tag)) out.push(tag);
    if (out.length >= MAX_TAGS_PER_QUESTION) break;
  }
  return out;
}
