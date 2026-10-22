/**
 * Plain-text excerpt of a markdown prompt, for lists such as the question
 * bank. Pure module.
 */

/** Strip markdown syntax and cut to `max` characters at a word boundary. */
export function markdownExcerpt(markdown: string, max = 180): string {
  const text = markdown
    .replace(/\r\n?/g, "\n")
    // Fenced code blocks: keep the code, drop the fences.
    .replace(/^\s*(```|~~~)[^\n]*$/gm, " ")
    // Images (alt text stays, data URLs and links go).
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    // Links: [tekst](url) → tekst
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // Headings, blockquotes, list markers, table rules.
    .replace(/^\s{0,3}#{1,6}\s+/gm, "")
    .replace(/^\s*>\s?/gm, "")
    .replace(/^\s*(?:[-*+]|\d+[.)])\s+/gm, "")
    .replace(/^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)*\|?\s*$/gm, " ")
    .replace(/\|/g, " ")
    // Emphasis and inline code.
    .replace(/(\*\*|__)(.+?)\1/g, "$2")
    .replace(/(^|[^\w*])[*_]([^*_\n]+)[*_](?=[^\w*]|$)/g, "$1$2")
    .replace(/`([^`]*)`/g, "$1")
    // HTML tags.
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (text.length <= max) return text;
  const cut = text.slice(0, max - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).replace(/[\s.,;:!?-]+$/, "")}…`;
}
