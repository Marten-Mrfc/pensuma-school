"use client";

/**
 * The shared Python components (src/components/python) and runner, re-exported
 * so the builder imports them from one place.
 */
export {
  CodeRunPanel,
  PythonErrorCard,
  SelfTestButton,
  TestResultsList,
} from "@/components/python";
export { usePythonRunner } from "@/lib/python/use-python-runner";
