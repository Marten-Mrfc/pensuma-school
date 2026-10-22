"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useSyncExternalStore } from "react";
import { useTRPC, useTRPCClient } from "@/trpc/react";
import {
  applyPreferencesToDocument,
  clearPreferencesFromDocument,
  getPreferencesSnapshot,
  getServerPreferencesSnapshot,
  initPreferences,
  receiveServerPreferences,
  registerPreferencesSaver,
  subscribePreferences,
} from "./preferences-store";

/**
 * Loads the signed-in user's display preferences and applies them to <html>:
 * data-font="readable", data-spacing="wide", data-contrast="more",
 * data-motion="reduce", --code-font-size and --app-font-scale.
 *
 * The localStorage mirror ('pensuma:prefs:<userId>') is applied first so
 * there is no flash of default styles; the account value follows. Everything
 * is removed again on unmount, so the next student on a shared computer
 * inherits nothing. Rendered once per area by CurrentUserProvider.
 */
export function PreferencesSync({ userId }: { userId: string }) {
  const trpc = useTRPC();
  const client = useTRPCClient();
  const queryClient = useQueryClient();
  const state = useSyncExternalStore(
    subscribePreferences,
    getPreferencesSnapshot,
    getServerPreferencesSnapshot,
  );

  useLayoutEffect(() => {
    initPreferences(userId);
  }, [userId]);

  useEffect(() => {
    const queryKey = trpc.preferences.get.queryKey();
    registerPreferencesSaver(async (patch) => {
      const saved = await client.preferences.update.mutate(patch);
      queryClient.setQueryData(queryKey, saved);
      return saved;
    });
  }, [client, queryClient, trpc]);

  const { data } = useQuery(
    trpc.preferences.get.queryOptions(undefined, {
      staleTime: 5 * 60_000,
      refetchOnWindowFocus: false,
      retry: 1,
    }),
  );

  useEffect(() => {
    if (data) receiveServerPreferences(userId, data);
  }, [data, userId]);

  useLayoutEffect(() => {
    if (state.userId === userId) applyPreferencesToDocument(state.prefs);
  }, [state, userId]);

  useLayoutEffect(() => () => clearPreferencesFromDocument(), []);

  return null;
}
