/**
 * Everything Pensuma keeps in the browser uses keys that start with
 * "pensuma:" (display preferences, the shortcuts opt-out, exam answer
 * backups, practice code, …). On sign-out they are removed, so the next
 * student on a shared school computer finds nothing of the previous one
 * (AVG data minimisation). The theme ("theme", next-themes) is a device
 * setting and stays.
 *
 * Students often end a session by closing the browser instead of signing
 * out (their session cookie dies with it), so the keys also record whose
 * they are ("pensuma:owner"): `claimLocalData(userId)` clears everything
 * of another user before the new user's pages read anything.
 */

export const LOCAL_DATA_PREFIX = "pensuma:";

/** The user id the local keys belong to. */
export const LOCAL_DATA_OWNER_KEY = `${LOCAL_DATA_PREFIX}owner`;

/** Every local key of an exam attempt starts with this prefix. */
export const ATTEMPT_BACKUP_PREFIX = `${LOCAL_DATA_PREFIX}poging:`;

/** Practice code of one user (the oefenomgeving). */
export function practiceCodeKey(userId: string): string {
  return `${LOCAL_DATA_PREFIX}oefenen:${userId}:code`;
}

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

function storageOf(name: "localStorage" | "sessionStorage"): Storage | null {
  try {
    return globalThis[name] ?? null;
  } catch {
    return null;
  }
}

/**
 * Remove every "pensuma:" key except the owner marker and the keys that
 * name `userId` as one of their segments ("pensuma:prefs:<id>",
 * "pensuma:oefenen:<id>:code"): those are this user's own. Returns how many
 * keys were removed.
 */
function clearAllExceptOwn(userId: string): number {
  let removed = 0;
  for (const name of ["localStorage", "sessionStorage"] as const) {
    try {
      const storage = storageOf(name);
      if (!storage) continue;
      const keys: string[] = [];
      for (let i = 0; i < storage.length; i++) {
        const key = storage.key(i);
        if (!key?.startsWith(LOCAL_DATA_PREFIX)) continue;
        if (key === LOCAL_DATA_OWNER_KEY) continue;
        if (key.split(":").includes(userId)) continue;
        keys.push(key);
      }
      for (const key of keys) storage.removeItem(key);
      removed += keys.length;
    } catch {
      // Storage blocked: nothing readable either.
    }
  }
  return removed;
}

/**
 * Make this browser's Pensuma data belong to `userId`. When it belonged to
 * someone else, or to nobody known (data from before this check, or a
 * marker that was removed), every key that is not explicitly this user's
 * (keyed by their id, such as the preferences mirror) is cleared first:
 * practice code, answer backups and unkeyed settings of whoever used the
 * browser before. Data of the same owner is kept, so a student who reopens
 * the browser can still recover an unsaved answer backup. Call it before
 * reading any other key. Never throws; returns whether data was cleared.
 */
export function claimLocalData(userId: string): boolean {
  if (!userId) return false;
  const local = storageOf("localStorage");
  let owner: string | null = null;
  try {
    owner = local?.getItem(LOCAL_DATA_OWNER_KEY) ?? null;
  } catch {
    return false;
  }
  if (owner === userId) return false;
  const cleared = clearAllExceptOwn(userId) > 0;
  try {
    local?.setItem(LOCAL_DATA_OWNER_KEY, userId);
  } catch {
    // Quota or blocked: the next claim clears again, which is safe.
  }
  return cleared;
}

/**
 * Remove the local copies (answer backup, flags, position) of these exam
 * attempts, e.g. once they are handed in. Never throws; returns how many
 * keys were removed.
 */
export function removeAttemptBackups(attemptIds: readonly string[]): number {
  if (attemptIds.length === 0) return 0;
  const prefixes = attemptIds.map((id) => `${ATTEMPT_BACKUP_PREFIX}${id}:`);
  let removed = 0;
  try {
    const storage = storageOf("localStorage");
    if (!storage) return 0;
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (key && prefixes.some((p) => key.startsWith(p))) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
    removed = keys.length;
  } catch {
    // Storage blocked: nothing was stored either.
  }
  return removed;
}

/**
 * Remove the local copies of every exam attempt except the ones in `keep`
 * (attempts still in progress), e.g. on the student dashboard. Never
 * throws; returns how many keys were removed.
 */
export function pruneAttemptBackups(keep: Iterable<string>): number {
  const kept = new Set(keep);
  let removed = 0;
  try {
    const storage = storageOf("localStorage");
    if (!storage) return 0;
    const keys: string[] = [];
    for (let i = 0; i < storage.length; i++) {
      const key = storage.key(i);
      if (!key?.startsWith(ATTEMPT_BACKUP_PREFIX)) continue;
      const attemptId = key.slice(ATTEMPT_BACKUP_PREFIX.length).split(":")[0];
      if (!kept.has(attemptId)) keys.push(key);
    }
    for (const key of keys) storage.removeItem(key);
    removed = keys.length;
  } catch {
    // Storage blocked: nothing was stored either.
  }
  return removed;
}
