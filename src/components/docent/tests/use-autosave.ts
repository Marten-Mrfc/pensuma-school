"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage } from "@/components/app/get-error-message";

export type AutosaveStatus =
  | "idle"
  | "pending"
  | "saving"
  | "saved"
  | "error"
  | "invalid";

export type AutosaveState = {
  status: AutosaveStatus;
  /** Dutch explanation for "error" / "invalid". */
  message?: string;
  /** Key that caused the error/invalid status. */
  key?: string;
  savedAt?: number;
};

export interface UseAutosaveOptions<T> {
  /** Persist one value. Throw to signal failure. */
  save: (key: string, value: T) => Promise<void>;
  /** Return a Dutch message when the value cannot be saved yet. */
  validate?: (key: string, value: T) => string | null;
  /** Debounce in ms. Default 800. */
  delay?: number;
}

/**
 * Debounced autosave for several independent documents (keyed by string).
 *
 * - `drafts` holds local values that are not yet confirmed by the server;
 *   render `drafts[key] ?? serverValue`.
 * - Saves run one at a time, in order, always with the newest value.
 * - `flush()` saves everything pending now (Ctrl+S, before switching
 *   questions, before publishing) and resolves `false` if anything failed.
 */
export function useAutosave<T>({
  save,
  validate,
  delay = 800,
}: UseAutosaveOptions<T>) {
  const [drafts, setDrafts] = useState<Record<string, T>>({});
  const [state, setState] = useState<AutosaveState>({ status: "idle" });

  const pending = useRef(new Map<string, T>());
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const chain = useRef<Promise<unknown>>(Promise.resolve());
  const invalidKeys = useRef(new Map<string, string>());
  const failedKeys = useRef(new Map<string, string>());
  const options = useRef({ save, validate });
  useEffect(() => {
    options.current = { save, validate };
  });

  const refreshState = useCallback((extra?: Partial<AutosaveState>) => {
    const [invalidKey, invalidMessage] =
      [...invalidKeys.current.entries()][0] ?? [];
    const [failedKey, failedMessage] =
      [...failedKeys.current.entries()][0] ?? [];
    if (invalidKey) {
      setState({ status: "invalid", message: invalidMessage, key: invalidKey });
    } else if (failedKey) {
      setState({ status: "error", message: failedMessage, key: failedKey });
    } else if (pending.current.size > 0) {
      setState((s) => (s.status === "saving" ? s : { status: "pending" }));
    } else {
      setState({ status: "saved", savedAt: Date.now(), ...extra });
    }
  }, []);

  const flushKey = useCallback(
    (key: string): Promise<boolean> => {
      const timer = timers.current.get(key);
      if (timer) clearTimeout(timer);
      timers.current.delete(key);

      const run = async (): Promise<boolean> => {
        const value = pending.current.get(key);
        if (value === undefined)
          return !invalidKeys.current.has(key) && !failedKeys.current.has(key);
        const invalid = options.current.validate?.(key, value) ?? null;
        if (invalid) {
          invalidKeys.current.set(key, invalid);
          refreshState();
          return false;
        }
        invalidKeys.current.delete(key);
        pending.current.delete(key);
        setState({ status: "saving" });
        try {
          await options.current.save(key, value);
          failedKeys.current.delete(key);
          if (!pending.current.has(key)) {
            setDrafts((d) => {
              if (d[key] !== value) return d;
              const { [key]: _removed, ...rest } = d;
              return rest;
            });
          }
          refreshState();
          return true;
        } catch (error) {
          if (!pending.current.has(key)) pending.current.set(key, value);
          failedKeys.current.set(
            key,
            getErrorMessage(error, "Opslaan lukte niet."),
          );
          refreshState();
          return false;
        }
      };

      const next = chain.current.then(run, run);
      chain.current = next;
      return next;
    },
    [refreshState],
  );

  const update = useCallback(
    (key: string, value: T) => {
      setDrafts((d) => ({ ...d, [key]: value }));
      pending.current.set(key, value);
      // A new edit may fix the problem; re-validate on save.
      invalidKeys.current.delete(key);
      if (!failedKeys.current.size)
        setState((s) => (s.status === "saving" ? s : { status: "pending" }));
      const timer = timers.current.get(key);
      if (timer) clearTimeout(timer);
      timers.current.set(
        key,
        setTimeout(() => void flushKey(key), delay),
      );
    },
    [delay, flushKey],
  );

  /** Save now. Without a key: everything pending (and retry failed saves). */
  const flush = useCallback(
    async (key?: string): Promise<boolean> => {
      const keys = key
        ? [key]
        : [
            ...new Set([
              ...pending.current.keys(),
              ...invalidKeys.current.keys(),
              ...failedKeys.current.keys(),
            ]),
          ];
      if (keys.length === 0) {
        await chain.current.catch(() => undefined);
        return true;
      }
      const results = await Promise.all(keys.map((k) => flushKey(k)));
      return results.every(Boolean);
    },
    [flushKey],
  );

  /** Forget a draft without saving (e.g. after deleting the document). */
  const discard = useCallback(
    (key: string) => {
      const timer = timers.current.get(key);
      if (timer) clearTimeout(timer);
      timers.current.delete(key);
      pending.current.delete(key);
      invalidKeys.current.delete(key);
      failedKeys.current.delete(key);
      setDrafts((d) => {
        if (!(key in d)) return d;
        const { [key]: _removed, ...rest } = d;
        return rest;
      });
      refreshState();
    },
    [refreshState],
  );

  const hasUnsaved = useCallback(
    () =>
      pending.current.size > 0 ||
      invalidKeys.current.size > 0 ||
      failedKeys.current.size > 0,
    [],
  );

  return { drafts, state, update, flush, discard, hasUnsaved };
}
