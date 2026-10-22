"use client";

import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import {
  type PrivacySettings,
  type PublicPrivacyInfo,
  privacySettingsSchema,
} from "@/lib/privacy/settings";
import { useTRPC } from "@/trpc/react";

/** Shown wherever a school contact has not been filled in yet. */
export const NO_CONTACT_FALLBACK = "Neem voor vragen contact op met je school.";

const subscribeNoop = () => () => {};

/**
 * False during server rendering and the hydration render, true after.
 * Several parts of /privacy share one query: a boundary that hydrates
 * after the data arrived must still render what the server rendered.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    subscribeNoop,
    () => true,
    () => false,
  );
}

/**
 * The public privacy settings (contacts, retention numbers). `data` stays
 * undefined (and `isPending` true) until after hydration.
 */
export function usePublicPrivacyInfo() {
  const trpc = useTRPC();
  const hydrated = useHydrated();
  const query = useQuery(
    trpc.privacy.publicInfo.queryOptions(undefined, {
      staleTime: 5 * 60_000,
    }),
  );
  return {
    data: hydrated ? query.data : undefined,
    isPending: !hydrated || query.isPending,
    isError: query.isError,
  };
}

/**
 * Full settings for DATA_CATEGORIES.retention(settings) from the public
 * info (defaults while loading or without JS).
 */
export function settingsFromPublicInfo(
  info: PublicPrivacyInfo | undefined,
): PrivacySettings {
  if (!info) return privacySettingsSchema.parse({});
  return privacySettingsSchema.parse({
    school: info.school,
    dpo: info.dpo,
    processor: info.processor,
    retention: {
      attemptEventsDays: info.retention.attemptEventsDays,
      attemptsMonths: info.retention.attemptsMonths,
      inactiveStudentMonths: info.retention.inactiveStudentMonths,
      auditLogMonths: info.retention.auditLogMonths,
      autoDeleteAttempts: info.retention.autoDeleteAttempts,
      // Only "confirmed or not" is public; the moment itself is not.
      confirmedAt: info.retention.confirmed ? new Date(0).toISOString() : null,
    },
    accessibility: info.accessibility,
  });
}
