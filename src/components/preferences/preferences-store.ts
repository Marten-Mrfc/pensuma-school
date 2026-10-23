import { toast } from "sonner";
import {
  mergePreferences,
  type PreferencesPatch,
  parsePreferences,
  preferenceAttributes,
  preferencesStorageKey,
  type UserPreferences,
} from "@/lib/preferences";

/**
 * Client-side store for the display preferences of the signed-in user (one
 * per browser tab). PreferencesSync feeds it (localStorage mirror first, then
 * the server); usePreferences() reads and updates it. Changes apply at once
 * and are saved to the account after a short pause.
 */

export interface PreferencesState {
  userId: string | null;
  prefs: UserPreferences;
  /** True once the server value (or a local change) is in. */
  loaded: boolean;
  /** The last save to the account failed (until a later one succeeds). */
  saveFailed: boolean;
}

export const SAVE_DEBOUNCE_MS = 500;
export const PREFERENCES_SAVE_ERROR =
  "Opslaan lukte niet; je instellingen gelden nu alleen op deze computer.";

const INITIAL_STATE: PreferencesState = Object.freeze({
  userId: null,
  prefs: parsePreferences({}),
  loaded: false,
  saveFailed: false,
});

let state: PreferencesState = INITIAL_STATE;
const listeners = new Set<() => void>();

/** Changes not yet confirmed by the server (cumulative). */
let unsaved: PreferencesPatch = {};
/** Bumped on every local change, to tell stale save responses apart. */
let version = 0;
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saver: ((patch: PreferencesPatch) => Promise<UserPreferences>) | null =
  null;

function emit(next: PreferencesState) {
  state = next;
  for (const listener of listeners) listener();
}

export function subscribePreferences(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getPreferencesSnapshot(): PreferencesState {
  return state;
}

export function getServerPreferencesSnapshot(): PreferencesState {
  return INITIAL_STATE;
}

/* ------------------------------------------------------------------ */
/* localStorage mirror                                                 */
/* ------------------------------------------------------------------ */

function readMirror(userId: string): UserPreferences | null {
  try {
    const raw = window.localStorage.getItem(preferencesStorageKey(userId));
    return raw ? parsePreferences(JSON.parse(raw)) : null;
  } catch {
    return null;
  }
}

function writeMirror(userId: string, prefs: UserPreferences) {
  try {
    window.localStorage.setItem(
      preferencesStorageKey(userId),
      JSON.stringify(prefs),
    );
  } catch {
    // Storage full or blocked: the account copy still applies.
  }
}

/* ------------------------------------------------------------------ */
/* <html> attributes                                                   */
/* ------------------------------------------------------------------ */

const DATA_KEYS = ["font", "spacing", "contrast", "motion"] as const;
const STYLE_KEYS = ["--code-font-size", "--app-font-scale"] as const;

/** Put the preferences on <html> (data-* attributes + CSS variables). */
export function applyPreferencesToDocument(prefs: UserPreferences) {
  const root = document.documentElement;
  const { dataset, style } = preferenceAttributes(prefs);
  for (const key of DATA_KEYS) {
    const value = dataset[key];
    if (value) root.dataset[key] = value;
    else delete root.dataset[key];
  }
  for (const key of STYLE_KEYS) root.style.setProperty(key, style[key]);
}

/** Remove everything applyPreferencesToDocument set. */
export function clearPreferencesFromDocument() {
  const root = document.documentElement;
  for (const key of DATA_KEYS) delete root.dataset[key];
  for (const key of STYLE_KEYS) root.style.removeProperty(key);
}

/* ------------------------------------------------------------------ */
/* Actions                                                             */
/* ------------------------------------------------------------------ */

/** Start (or switch to) a user: apply their mirrored preferences right away. */
export function initPreferences(userId: string) {
  if (state.userId === userId) return;
  unsaved = {};
  version++;
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  const mirror = readMirror(userId);
  emit({
    userId,
    prefs: mirror ?? INITIAL_STATE.prefs,
    loaded: false,
    saveFailed: false,
  });
}

/** The server value arrived; local changes that aren't saved yet win. */
export function receiveServerPreferences(
  userId: string,
  serverPrefs: UserPreferences,
) {
  if (state.userId !== userId) return;
  const prefs = mergePreferences(serverPrefs, unsaved);
  writeMirror(userId, prefs);
  emit({ ...state, prefs, loaded: true });
}

/** Registered by PreferencesSync, which has the tRPC client. */
export function registerPreferencesSaver(
  save: (patch: PreferencesPatch) => Promise<UserPreferences>,
) {
  saver = save;
}

function flush(): Promise<void> {
  saveTimer = null;
  const userId = state.userId;
  if (!saver || !userId || Object.keys(unsaved).length === 0) {
    return Promise.resolve();
  }
  const sentVersion = version;
  return saver({ ...unsaved }).then(
    (serverPrefs) => {
      if (state.userId !== userId || version !== sentVersion) return;
      unsaved = {};
      writeMirror(userId, serverPrefs);
      emit({ ...state, prefs: serverPrefs, loaded: true, saveFailed: false });
    },
    () => {
      if (state.userId !== userId) return;
      // Also shown in the dialog itself (usePreferences().saveFailed): a
      // toast can't be reached by keyboard while the dialog traps focus.
      emit({ ...state, saveFailed: true });
      toast.error(PREFERENCES_SAVE_ERROR, {
        id: "preferences-save",
        duration: 10_000,
      });
    },
  );
}

/**
 * Save a change that is still waiting for the debounce right now. Used
 * before signing out, so the last change isn't lost (and doesn't fire after
 * the session is gone).
 */
export function flushPendingPreferences(): Promise<void> {
  if (!saveTimer) return Promise.resolve();
  clearTimeout(saveTimer);
  return flush();
}

/**
 * Forget the signed-in user's preferences in this tab (sign-out): cancels a
 * pending save and drops unsaved changes, so nothing of the previous user is
 * written back to localStorage after it was cleared.
 */
export function resetPreferences() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = null;
  unsaved = {};
  version++;
  emit(INITIAL_STATE);
}

/** Apply a change now (optimistic) and save it to the account shortly after. */
export function updatePreferences(patch: PreferencesPatch) {
  const prefs = mergePreferences(state.prefs, patch);
  unsaved = { ...unsaved, ...patch };
  version++;
  emit({ ...state, prefs, loaded: true });
  if (state.userId) writeMirror(state.userId, prefs);
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, SAVE_DEBOUNCE_MS);
}
