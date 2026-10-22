"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getPythonClient } from "./runner-client";
import type { PythonRunner } from "./types";

/**
 * Browser Python runner (Pyodide in a Web Worker), shared by every component
 * on the page. Implements the `PythonRunner` contract:
 *
 *   const runner = usePythonRunner();
 *   runner.preload();                       // start downloading Pyodide
 *   const r = await runner.run({ code, stdin, timeLimitMs, onSegment, onInput });
 *   const g = await runner.grade({ code, tests, checks, timeLimitMs });
 *   runner.stop();                          // terminate + respawn the worker
 *
 * `onInput(prompt)` makes input() interactive when `runner.interactive` is
 * true (the page is cross-origin isolated); otherwise `stdin` lines are used.
 * Pass `{ preload: true }` to start loading Pyodide when the component mounts.
 */
export function usePythonRunner(
  options: { preload?: boolean } = {},
): PythonRunner {
  const client = getPythonClient();
  const snapshot = useSyncExternalStore(
    client.subscribe,
    client.getSnapshot,
    client.getServerSnapshot,
  );
  const preload = options.preload ?? false;
  useEffect(() => {
    if (preload) client.preload();
  }, [client, preload]);
  return {
    status: snapshot.status,
    interactive: snapshot.interactive,
    loadError: snapshot.loadError,
    preload: client.preload,
    run: client.run,
    grade: client.grade,
    stop: client.stop,
  };
}
