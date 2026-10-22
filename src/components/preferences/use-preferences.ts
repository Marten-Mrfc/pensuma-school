"use client";

import { useSyncExternalStore } from "react";
import type { PreferencesPatch, UserPreferences } from "@/lib/preferences";
import {
  getPreferencesSnapshot,
  getServerPreferencesSnapshot,
  subscribePreferences,
  updatePreferences,
} from "./preferences-store";

export interface UsePreferencesResult {
  /** Current preferences (defaults until loaded; never undefined). */
  prefs: UserPreferences;
  /** Apply a change immediately; it is saved to the account after a pause. */
  update: (patch: PreferencesPatch) => void;
  /** True until the account's preferences are known. */
  isLoading: boolean;
}

/**
 * Display preferences of the signed-in user. Works anywhere below
 * CurrentUserProvider (docent, leerling and exam pages), where
 * PreferencesSync loads and applies them.
 */
export function usePreferences(): UsePreferencesResult {
  const state = useSyncExternalStore(
    subscribePreferences,
    getPreferencesSnapshot,
    getServerPreferencesSnapshot,
  );
  return {
    prefs: state.prefs,
    update: updatePreferences,
    isLoading: state.userId !== null && !state.loaded,
  };
}
