/**
 * Where focus goes after an item is removed from an editable list (test
 * cases, answer options, questions). The removed element had focus, so
 * without a new target focus falls back to <body> and keyboard users start
 * again at the top of the page (WCAG 2.4.3).
 */

/**
 * The id of the item that takes the removed item's place: the next item,
 * else the previous one. `null` when the list is empty afterwards (then
 * focus the list's "add" button instead).
 *
 * @param items the list *before* the removal
 * @param removedIndex position of the removed item in `items`
 */
export function neighbourAfterRemoval(
  items: readonly { id: string }[],
  removedIndex: number,
): string | null {
  if (removedIndex < 0 || removedIndex >= items.length) return null;
  return items[removedIndex + 1]?.id ?? items[removedIndex - 1]?.id ?? null;
}
