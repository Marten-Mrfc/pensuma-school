/**
 * Everything Pensuma keeps in the browser uses keys that start with
 * "pensuma:" (display preferences, the shortcuts opt-out, exam answer
 * backups, …). On sign-out they are removed, so the next student on a shared
 * school computer finds nothing of the previous one (AVG data minimisation).
 * The theme ("theme", next-themes) is a device setting and stays.
 */

export const LOCAL_DATA_PREFIX = "pensuma:";

function clearStorage(storage: Storage | undefined): number {
  if (!storage) return 0;
  const keys: string[] = [];
  for (let i = 0; i < storage.length; i++) {
    const key = storage.key(i);
    if (key?.startsWith(LOCAL_DATA_PREFIX)) keys.push(key);
  }
  for (const key of keys) storage.removeItem(key);
  return keys.length;
}

/**
 * Remove every localStorage and sessionStorage key starting with
 * "pensuma:". Never throws (storage may be blocked); returns how many keys
 * were removed.
 */
export function clearLocalUserData(): number {
  let removed = 0;
  for (const name of ["localStorage", "sessionStorage"] as const) {
    try {
      removed += clearStorage(globalThis[name]);
    } catch {
      // Storage unavailable (privacy mode, blocked cookies): nothing to clear.
    }
  }
  return removed;
}
