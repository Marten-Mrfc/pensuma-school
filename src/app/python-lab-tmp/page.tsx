"use client";
// TEMPORARY (grader verification) — deleted after testing.
import { useEffect, useState } from "react";
import { CodeRunPanel, SelfTestButton, TestResultsList } from "@/components/python";
import { usePythonRunner } from "@/lib/python/use-python-runner";
import { type CodeGradingResult, codeQuestionDataSchema } from "@/lib/questions/schema";

const data = codeQuestionDataSchema.parse({
  tests: [
    { id: "t1", kind: "io", name: "Invoer: Mark", stdin: "Mark", expectedOutput: "Hallo Mark" },
    { id: "t2", kind: "io", name: "Invoer: Fatima", stdin: "Fatima", expectedOutput: "Hallo Fatima" },
    { id: "t3", kind: "io", name: "Verborgen", stdin: "Sem", expectedOutput: "Hallo Sem", hidden: true },
  ],
  checks: [{ id: "c1", kind: "forbids", construct: "while_loop" }],
});

export default function PythonLab() {
  const runner = usePythonRunner({ preload: true });
  const [code, setCode] = useState('naam = input("Wat is je naam? ")\nprint("Hallo " + naam)');
  const [serverResult, setServerResult] = useState<CodeGradingResult | null>(null);
  const [coi, setCoi] = useState("?");
  useEffect(() => setCoi(String(window.crossOriginIsolated)), []);
  useEffect(() => {
    (window as unknown as Record<string, unknown>).__pensuma = {
      grade: runner.grade,
      run: runner.run,
      status: () => runner.status,
      interactive: runner.interactive,
    };
  }, [runner]);
  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-6 p-6">
      <h1 className="text-2xl font-semibold">Python-lab (tijdelijk)</h1>
      <p data-testid="coi">crossOriginIsolated: {coi}</p>
      <textarea
        data-testid="code"
        className="bg-card h-32 rounded-md border p-2 font-mono text-sm"
        value={code}
        onChange={(e) => setCode(e.target.value)}
      />
      <div className="flex gap-2">
        <SelfTestButton code={code} tests={data.tests} checks={data.checks} timeLimitMs={3000} />
        <button
          type="button"
          data-testid="server-grade"
          className="rounded-md border px-3"
          onClick={async () => {
            const r = await fetch("/api/python-lab-tmp", {
              method: "POST",
              body: JSON.stringify({ input: { code, tests: data.tests, checks: data.checks, timeLimitMs: 3000 } }),
            });
            setServerResult(await r.json());
          }}
        >
          Server-nakijken
        </button>
      </div>
      <CodeRunPanel code={code} timeLimitMs={3000} />
      {serverResult ? <TestResultsList result={serverResult} /> : null}
    </main>
  );
}
