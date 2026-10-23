/**
 * End-to-end tests of the server grader (real sandboxed Pyodide processes):
 *   1. sample questions (incl. the core input() prompt case) + failing variants
 *   2. adversarial tests (secrets, fs, processes, network, timeouts, memory,
 *      output flood, isolation between jobs) — including a simulated
 *      "escaped into JavaScript" attacker
 *   3. performance numbers (cold start, latency, memory, throughput)
 *
 * Run: bun run test:grader          (exit code 1 when a check fails)
 */

import fs from "node:fs";
import http from "node:http";
import type net from "node:net";
import os from "node:os";
import path from "node:path";
import type { GradeInput } from "@/lib/python/types";
import {
  type CodeQuestionData,
  type CodeTest,
  codeQuestionDataSchema,
  redactCodeResultForStudent,
} from "@/lib/questions/schema";
import { DEMO_QUESTIONS } from "@/server/demo/questions";
import { graderConfig, resetGraderConfig } from "@/server/grader/config";
import {
  gradeCode,
  gradeCodeBatch,
  runCode,
  runCodeBatch,
} from "@/server/grader/grader";
import { getGraderPool, SandboxPool } from "@/server/grader/pool";
import { SandboxProcess } from "@/server/grader/sandbox-process";

// A fake secret in the parent's environment: it must never reach a sandbox.
process.env.PENSUMA_FAKE_SECRET = "s3cr3t-DO-NOT-LEAK-42";

let failures = 0;
let passes = 0;
function check(name: string, ok: boolean, detail = ""): void {
  if (ok) passes++;
  else failures++;
  console.log(`${ok ? "  ✓" : "  ✗"} ${name}${detail ? `  — ${detail}` : ""}`);
}
function section(title: string): void {
  console.log(`\n=== ${title}`);
}
const q = (data: unknown): CodeQuestionData =>
  codeQuestionDataSchema.parse(data);
const ms = (n: number) => `${Math.round(n)} ms`;
const mb = (bytes: number) => `${Math.round(bytes / 1048576)} MB`;

// Record everything the parent sends to sandboxes (to prove expected values never go there).
const sentToSandboxes: string[] = [];
{
  const proto = SandboxProcess.prototype as unknown as {
    write: (obj: unknown) => void;
  };
  const original = proto.write;
  proto.write = function (this: unknown, obj: unknown) {
    sentToSandboxes.push(JSON.stringify(obj));
    return original.call(this, obj);
  };
}

/* -------------------------------------------------------------------------- */
/*                              Sample questions                              */
/* -------------------------------------------------------------------------- */

const helloWorld = q({
  solution: 'print("Hallo wereld!")',
  tests: [
    {
      id: "t1",
      kind: "io",
      name: "Begroeting",
      expectedOutput: "Hallo wereld!",
    },
  ],
});

const naam = q({
  solution: 'naam = input("Wat is je naam? ")\nprint("Hallo " + naam)',
  tests: [
    {
      id: "t1",
      kind: "io",
      name: "Invoer: Mark",
      stdin: "Mark",
      expectedOutput: "Hallo Mark",
    },
    {
      id: "t2",
      kind: "io",
      name: "Exact",
      stdin: "Mark",
      expectedOutput: "Hallo Mark",
      match: "exact",
      ignoreCase: false,
    },
    {
      id: "t3",
      kind: "io",
      name: "Verborgen",
      stdin: "Fatima",
      expectedOutput: "Hallo Fatima",
      hidden: true,
    },
  ],
});

const valuta = q({
  solution:
    'bedrag = float(input("Hoeveel euro wil je omrekenen? "))\ndollars = bedrag * 1.085\nprint("Dat is", round(dollars, 2), "dollar")',
  tests: [
    {
      id: "t1",
      kind: "io",
      name: "100 euro",
      stdin: "100",
      expectedOutput: "108.50",
      match: "numbers",
    },
    {
      id: "t2",
      kind: "io",
      name: "12.5 euro",
      stdin: "12.5",
      expectedOutput: "13.56",
      match: "numbers",
    },
    {
      id: "t3",
      kind: "io",
      name: "Verborgen",
      stdin: "0",
      expectedOutput: "0",
      match: "numbers",
      hidden: true,
    },
  ],
});

const even = q({
  solution:
    "getallen = [3, 8, 5, 12, 7, 6]\nfor g in getallen:\n    if g % 2 == 0:\n        print(g)",
  tests: [
    { id: "t1", kind: "io", name: "Even getallen", expectedOutput: "8\n12\n6" },
  ],
  checks: [
    { id: "c1", kind: "requires", construct: "for_loop" },
    { id: "c2", kind: "requires", construct: "if_statement" },
  ],
});

const gemiddelde = q({
  solution: "def gemiddelde(lijst):\n    return sum(lijst) / len(lijst)",
  tests: [
    {
      id: "f1",
      kind: "function",
      name: "Vier getallen",
      call: "gemiddelde([1, 2, 3, 4])",
      expected: "2.5",
    },
    {
      id: "f2",
      kind: "function",
      name: "Eén getal",
      call: "gemiddelde([10])",
      expected: "10.0",
    },
    {
      id: "f3",
      kind: "function",
      name: "Kommagetallen",
      call: "gemiddelde([2.5, 3.5])",
      expected: "3.0",
    },
    {
      id: "f4",
      kind: "function",
      name: "Verborgen",
      call: "gemiddelde([-1, 1])",
      expected: "0.0",
      hidden: true,
    },
  ],
  checks: [
    {
      id: "c1",
      kind: "requires",
      construct: "function_def",
      value: "gemiddelde",
    },
  ],
});

type Case = {
  name: string;
  data: CodeQuestionData;
  code?: string;
  expect: (r: Awaited<ReturnType<typeof gradeCode>>) => boolean;
};

const cases: Case[] = [
  {
    name: "hello world (solution)",
    data: helloWorld,
    expect: (r) => r.fraction === 1,
  },
  {
    name: "hello world: 'Hello world'",
    data: helloWorld,
    code: 'print("Hello world")',
    expect: (r) => r.fraction === 0,
  },
  {
    name: 'CORE: naam = input("Wat is je naam? ") + "Hallo Mark" passes (flexible AND exact)',
    data: naam,
    expect: (r) => r.fraction === 1 && r.status === "ok",
  },
  {
    name: "naam: input() without prompt also passes",
    data: naam,
    code: 'naam = input()\nprint("Hallo " + naam)',
    expect: (r) => r.fraction === 1,
  },
  {
    name: "naam: missing space → fails",
    data: naam,
    code: 'naam = input("Naam: ")\nprint("Hallo" + naam)',
    expect: (r) => r.fraction === 0,
  },
  {
    name: "naam: print-prompt on its own line still passes flexible",
    data: naam,
    code: 'print("Wat is je naam?")\nnaam = input()\nprint("Hallo " + naam)',
    expect: (r) => r.tests[0].passed && !r.tests[1].passed,
  },
  {
    name: "valuta (solution, numbers mode)",
    data: valuta,
    expect: (r) => r.fraction === 1,
  },
  {
    name: "valuta: Dutch comma output 108,50 passes",
    data: valuta,
    code: 'b = float(input("Bedrag: "))\nprint(f"Dat is {b * 1.085:.2f} dollar".replace(".", ","))',
    expect: (r) => r.fraction === 1,
  },
  {
    name: "valuta: wrong rate 1.08 fails",
    data: valuta,
    code: "b = float(input())\nprint(round(b * 1.08, 2))",
    expect: (r) => r.tests[0].passed === false,
  },
  {
    name: "valuta: int(input()) crashes on 12.5",
    data: valuta,
    code: "b = int(input())\nprint(round(b * 1.085, 2))",
    expect: (r) => r.status === "runtime_error",
  },
  { name: "even (solution)", data: even, expect: (r) => r.fraction === 1 },
  {
    name: "even: prints all numbers → fails",
    data: even,
    code: "for g in [3, 8, 5, 12, 7, 6]:\n    print(g)",
    expect: (r) => !r.tests[0].passed,
  },
  {
    name: "even: list comprehension passes test, fails for-loop check",
    data: even,
    code: "print(*[g for g in [3, 8, 5, 12, 7, 6] if g % 2 == 0], sep='\\n')",
    expect: (r) => r.tests[0].passed && !r.checks[0].passed,
  },
  {
    name: "gemiddelde (solution)",
    data: gemiddelde,
    expect: (r) => r.fraction === 1,
  },
  {
    name: "gemiddelde: print instead of return",
    data: gemiddelde,
    code: "def gemiddelde(lijst):\n    print(sum(lijst) / len(lijst))",
    expect: (r) =>
      r.tests[0].feedback?.includes("return in plaats van print") === true,
  },
  {
    name: "gemiddelde: // integer division",
    data: gemiddelde,
    code: "def gemiddelde(lijst):\n    return sum(lijst) // len(lijst)",
    expect: (r) => !r.tests[0].passed && r.tests[1].passed,
  },
  {
    name: "gemiddelde: wrong name",
    data: gemiddelde,
    code: "def Gemiddelde(lijst):\n    return sum(lijst) / len(lijst)",
    expect: (r) => r.fraction === 0,
  },
  {
    name: "gemiddelde: test code with input() at top level still passes",
    data: gemiddelde,
    code: 'def gemiddelde(lijst):\n    return sum(lijst) / len(lijst)\n\ngetal = int(input("Getal: "))\nprint(gemiddelde([getal]))',
    expect: (r) => r.fraction === 1,
  },
  {
    name: "syntax error",
    data: helloWorld,
    code: 'print("Hallo"',
    expect: (r) => r.status === "syntax_error" && r.error?.line === 1,
  },
  {
    name: "infinite loop → timeout",
    data: { ...helloWorld, timeLimitMs: 1000 },
    code: "while True:\n    pass",
    expect: (r) => r.status === "timeout" && r.tests[0].timedOut,
  },
];

async function sampleQuestions(): Promise<void> {
  section("Sample questions");
  for (const c of cases) {
    const t = performance.now();
    const r = await gradeCode({
      code: c.code ?? c.data.solution,
      tests: c.data.tests,
      checks: c.data.checks,
      timeLimitMs: c.data.timeLimitMs,
    });
    const ok = c.expect(r);
    check(
      c.name,
      ok,
      `${r.status}, ${r.passedWeight}/${r.totalWeight}, ${ms(performance.now() - t)}`,
    );
    for (const test of r.tests) {
      if (!test.passed || test.feedback) {
        console.log(
          `      [${test.passed ? "ok" : "x"}] ${test.name || test.testId}: ${test.feedback ?? ""}`,
        );
      }
    }
    for (const ch of r.checks)
      if (!ch.passed) console.log(`      [x] check: ${ch.message}`);
    if (r.error)
      console.log(
        `      error: ${r.error.type}: ${r.error.message} (regel ${r.error.line})`,
      );
    if (!ok) console.log(JSON.stringify(r, null, 2).slice(0, 3000));
  }
  const leaked = sentToSandboxes.some(
    (m) =>
      m.includes("Hallo Fatima") ||
      m.includes('"expected"') ||
      m.includes("expectedOutput"),
  );
  check(
    "no expected output/value was ever sent to a sandbox",
    !leaked,
    `${sentToSandboxes.length} messages inspected`,
  );

  const run = await runCode({
    code: 'naam = input("Naam? ")\nprint("Hoi", naam)',
    stdin: "Mark",
  });
  check(
    "runCode: clean stdout + transcript with prompt",
    run.stdout === "Hoi Mark\n" && run.transcript === "Naam? Mark\nHoi Mark\n",
    JSON.stringify(run.transcript),
  );
  const batch = await runCodeBatch(
    "x = int(input())\nprint(x * 2)",
    ["1", "21", "abc"],
    2000,
  );
  check(
    "runCodeBatch (generateExpected): one result per stdin",
    batch.length === 3 &&
      batch[0].stdout === "2\n" &&
      batch[1].stdout === "42\n" &&
      batch[2].error?.type === "ValueError",
  );
}

/* -------------------------------------------------------------------------- */
/*                                 Adversarial                                */
/* -------------------------------------------------------------------------- */

async function startCanary(): Promise<{
  port: number;
  hits: () => number;
  close: () => void;
}> {
  let hits = 0;
  const server = http.createServer((_req, res) => {
    hits++;
    res.end("canary");
  });
  server.on("connection", () => hits++);
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const port = (server.address() as net.AddressInfo).port;
  return { port, hits: () => hits, close: () => server.close() };
}

async function py(code: string, timeLimitMs = 5000) {
  return runCode({ code, timeLimitMs });
}

async function adversarialPython(): Promise<void> {
  section("Adversarial: student Python code");
  const canary = await startCanary();
  const secret = process.env.PENSUMA_FAKE_SECRET as string;
  const leaks = (s: string) =>
    s.includes(secret) ||
    s.includes("DATABASE_URL") ||
    s.includes("BETTER_AUTH");

  let r = await py("import js\nprint(js.process.env)");
  check(
    "import js; js.process.env → not reachable",
    r.error?.type === "AttributeError" && !leaks(r.stdout),
    `${r.error?.type}: ${r.error?.message}`,
  );

  r = await py(
    "import js\nprint(sorted(k for k in dir(js) if not k.startswith('_')))",
  );
  check(
    "`js` module is an empty object (no globalThis)",
    !r.stdout.includes("process") && !r.stdout.includes("require"),
    r.stdout.trim().slice(0, 120),
  );

  r = await py("import os\nprint(dict(os.environ))");
  check(
    "os.environ contains no secrets",
    !leaks(r.stdout),
    r.stdout.trim().slice(0, 120),
  );

  r = await py("from pyodide.code import run_js\nprint(run_js('process.env'))");
  check(
    "run_js (eval) is blocked",
    r.error !== null && !leaks(r.stdout),
    `${r.error?.type}: ${r.error?.message.slice(0, 100)}`,
  );

  r = await py(
    "import pyodide_js\nf = pyodide_js.constructor.constructor\nprint(f('return process.env')())",
  );
  check(
    "JsProxy .constructor.constructor (Function) is blocked",
    r.error !== null && !leaks(r.stdout),
    `${r.error?.type}: ${r.error?.message.slice(0, 100)}`,
  );

  r = await py("print(open('/etc/passwd').read())");
  check(
    "open('/etc/passwd') fails (virtual FS)",
    r.error !== null && !r.stdout.includes("root:"),
    r.error?.type,
  );

  r = await py(
    "import pyodide_js\npyodide_js.mountNodeFS('/mnt', '/etc')\nprint(open('/mnt/passwd').read())",
  );
  check(
    "mountNodeFS('/etc') + read passwd → denied by Node permission model",
    r.error !== null && !r.stdout.includes("root:"),
    `${r.error?.type}: ${r.error?.message.slice(0, 120)}`,
  );

  r = await py(
    "import pyodide_js\npyodide_js.mountNodeFS('/mnt', '/proc/self')\nprint(open('/mnt/environ').read())",
  );
  check(
    "read /proc/self/environ via NODEFS → denied",
    r.error !== null && !leaks(r.stdout),
    `${r.error?.type}: ${r.error?.message.slice(0, 120)}`,
  );

  r = await py(
    `import pyodide_js\npyodide_js.mountNodeFS('/mnt', ${JSON.stringify(process.cwd())})\nprint(open('/mnt/.env').read())`,
  );
  check(
    "read the app's .env via NODEFS → denied",
    r.error !== null && !leaks(r.stdout),
    `${r.error?.type}: ${r.error?.message.slice(0, 120)}`,
  );

  r = await py(
    "import subprocess\nprint(subprocess.run(['id'], capture_output=True))",
  );
  check(
    "subprocess.run fails",
    r.error !== null,
    `${r.error?.type}: ${r.error?.message.slice(0, 100)}`,
  );

  r = await py(
    `import socket\ns = socket.create_connection(("127.0.0.1", ${canary.port}), timeout=2)\ns.sendall(b"GET / HTTP/1.0\\r\\n\\r\\n")\nprint(s.recv(100))`,
  );
  check(
    "socket to 127.0.0.1 fails",
    r.error !== null && canary.hits() === 0,
    `${r.error?.type}: ${r.error?.message.slice(0, 100)}; canary hits ${canary.hits()}`,
  );

  r = await py(
    `from pyodide.http import pyfetch\nimport asyncio\nasync def main():\n    r = await pyfetch("http://127.0.0.1:${canary.port}/")\n    print(await r.string())\nasyncio.run(main())`,
  );
  check(
    "pyfetch to 127.0.0.1 fails",
    r.error !== null && canary.hits() === 0,
    `${r.error?.type}: ${r.error?.message.slice(0, 100)}; canary hits ${canary.hits()}`,
  );

  r = await py(
    `import pyodide_js, asyncio\nasync def main():\n    await pyodide_js.loadPackage("http://127.0.0.1:${canary.port}/evil-1.0-py3-none-any.whl")\nasyncio.run(main())\nprint("loaded")`,
  );
  await new Promise((res) => setTimeout(res, 300));
  check(
    "loadPackage(http://127.0.0.1) makes no request",
    canary.hits() === 0,
    `${r.error?.type ?? "no error"}: ${(r.error?.message ?? r.stdout).slice(0, 100)}; canary hits ${canary.hits()}`,
  );

  r = await py(
    "import urllib.request\nprint(urllib.request.urlopen('http://127.0.0.1:%d/' % " +
      canary.port +
      ").read())",
  );
  check(
    "urllib to 127.0.0.1 fails",
    r.error !== null && canary.hits() === 0,
    `${r.error?.type}; canary hits ${canary.hits()}`,
  );

  r = await py(
    "import threading\nt = threading.Thread(target=print, args=('x',))\nt.start()",
  );
  check("threads are not available", r.error !== null, r.error?.type);

  // Timeouts + recovery
  r = await py("while True:\n    pass", 1000);
  check(
    "infinite loop → killed after the 1 s time limit",
    r.timedOut && r.durationMs >= 1000 && r.durationMs < 1500,
    ms(r.durationMs),
  );
  r = await py("print('nog steeds hier')");
  check("pool recovers after timeout", r.stdout === "nog steeds hier\n");

  // Memory
  let t = performance.now();
  r = await py("x = []\nwhile True:\n    x.append(' ' * 10**6)", 15000);
  check(
    "Python memory bomb → MemoryError (wasm cap)",
    r.error?.type === "MemoryError",
    `${r.error?.type}, ${ms(performance.now() - t)}`,
  );
  r = await py("x = 'a' * (10**9)");
  check(
    "huge allocation → MemoryError",
    r.error?.type === "MemoryError",
    r.error?.type,
  );
  r = await py("print(sum(range(10)))");
  check("pool recovers after memory bomb", r.stdout === "45\n");

  // Output flood
  t = performance.now();
  r = await py("while True:\n    print('x' * 1000)", 5000);
  check(
    "huge output is truncated with a Dutch note",
    r.truncated === true &&
      r.stdout.length <= 70_000 &&
      r.stderr.includes("ingekort") &&
      r.error?.type === "OutputLimitExceeded",
    `${r.stdout.length} chars, ${ms(performance.now() - t)}`,
  );

  // Recursion
  r = await py(
    "import sys\nsys.setrecursionlimit(10**6)\ndef f(n):\n    return f(n + 1)\nf(0)",
  );
  check(
    "deep recursion → RecursionError (limit is capped)",
    r.error?.type === "RecursionError",
    `${r.error?.type} ${ms(r.durationMs)}`,
  );

  // Isolation between jobs and between tests
  await py(
    "import builtins, sys\nbuiltins.print = lambda *a, **k: None\nopen('/tmp/geheim.txt', 'w').write('x')\nsys.modules['os'].evil = 1",
  );
  r = await py(
    "import os\nprint(os.path.exists('/tmp/geheim.txt'), hasattr(os, 'evil'))",
  );
  check(
    "one student's job cannot affect the next job",
    r.stdout === "False False\n",
    JSON.stringify(r.stdout),
  );
  const within = await gradeCode({
    code: "import builtins\nif hasattr(builtins, 'marker'):\n    print('besmet')\nelse:\n    builtins.marker = 1\n    print('schoon')",
    tests: [
      {
        id: "a",
        kind: "io",
        name: "",
        hidden: false,
        weight: 1,
        stdin: "",
        expectedOutput: "schoon",
        match: "exact",
        ignoreCase: true,
        tolerance: 0,
      },
      {
        id: "b",
        kind: "io",
        name: "",
        hidden: false,
        weight: 1,
        stdin: "",
        expectedOutput: "schoon",
        match: "exact",
        ignoreCase: true,
        tolerance: 0,
      },
    ],
    checks: [],
    timeLimitMs: 2000,
  });
  check(
    "tests within one job start from a clean interpreter",
    within.fraction === 1,
    within.tests.map((x) => x.actual?.trim()).join(","),
  );
  canary.close();
}

/**
 * Simulated escape: arbitrary JavaScript running inside a real sandbox
 * process after lockdown. We copy sandbox.mjs into a temp folder and inject
 * a test-only hook (production code has no such hook). The "attacker" also
 * gets references to fs / child_process / worker_threads / net captured
 * BEFORE lockdown (worst case: Pyodide internals leak such a reference).
 */
async function adversarialJsEscape(): Promise<void> {
  section("Adversarial: simulated escape into JavaScript inside the sandbox");
  const config = graderConfig();
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pensuma-evil-"));
  let src = fs.readFileSync(config.sandboxScript, "utf8");
  src = src.replace(
    "  lockdown();\n",
    '  const __evil = await import("./evil.mjs");\n  lockdown();\n',
  );
  src = src.replace(
    '      } else if (msg.t === "ping") {',
    '      } else if (msg.t === "evil") {\n        send({ t: "evil-result", id, result: await __evil.default(msg.arg) });\n      } else if (msg.t === "ping") {',
  );
  if (!src.includes("__evil.default"))
    throw new Error("could not inject the test hook");
  fs.writeFileSync(path.join(dir, "sandbox.mjs"), src);
  fs.writeFileSync(
    path.join(dir, "evil.mjs"),
    `
const pre = {
  fs: process.getBuiltinModule("fs"),
  cp: process.getBuiltinModule("child_process"),
  wt: process.getBuiltinModule("worker_threads"),
  net: process.getBuiltinModule("net"),
};
async function attempt(fn) {
  try { const v = await fn(); return "OK " + String(v).slice(0, 80); }
  catch (e) { return "BLOCKED " + (e && (e.code || e.name)) + ": " + String(e && e.message).slice(0, 80); }
}
export default async function evil(arg) {
  return {
    envKeys: Object.keys(process.env).join(","),
    getBuiltinModule: await attempt(() => process.getBuiltinModule("child_process").execSync("id")),
    dynamicImport: await attempt(async () => (await import("node:child_process")).execSync("id")),
    dynamicImportFs: await attempt(async () => (await import("node:fs")).readFileSync("/etc/passwd", "utf8")),
    binding: await attempt(() => process.binding("spawn_sync")),
    newFunction: await attempt(() => new Function("return 1")()),
    globalRequire: typeof globalThis.require,
    fetchType: typeof globalThis.fetch,
    killParent: await attempt(() => process.kill(process.ppid, 0)),
    debugParent: await attempt(() => process._debugProcess(process.ppid)),
    execve: await attempt(() => process.execve("/bin/sh", ["sh", "-c", "id"])),
    capturedSpawn: await attempt(() => pre.cp.execSync("id").toString()),
    capturedReadPasswd: await attempt(() => pre.fs.readFileSync("/etc/passwd", "utf8")),
    capturedReadEnviron: await attempt(() => pre.fs.readFileSync("/proc/self/environ", "utf8")),
    capturedReadParentEnviron: await attempt(() => pre.fs.readFileSync("/proc/" + process.ppid + "/environ", "utf8")),
    capturedReadDotEnv: await attempt(() => pre.fs.readFileSync(arg.dotenv, "utf8")),
    capturedWrite: await attempt(() => pre.fs.writeFileSync("/tmp/pensuma-evil.txt", "x")),
    capturedWorker: await attempt(() => new pre.wt.Worker("process.exit(0)", { eval: true })),
    capturedNetConnect: await attempt(() => new Promise((res, rej) => {
      const s = pre.net.connect(arg.port, "127.0.0.1", () => { s.end(); res("connected"); });
      s.on("error", rej);
      setTimeout(() => rej(new Error("timeout")), 2000);
    })),
  };
}
`,
  );
  const canary = await startCanary();
  const proc = new SandboxProcess({
    ...config,
    sandboxDir: dir,
    sandboxScript: path.join(dir, "sandbox.mjs"),
  });
  await proc.ready;
  const resp = await proc.request(
    {
      t: "evil",
      arg: { port: canary.port, dotenv: path.join(process.cwd(), ".env") },
    },
    10_000,
  );
  proc.kill();
  canary.close();
  fs.rmSync(dir, { recursive: true, force: true });
  if (!resp.ok) {
    check("evil probe ran", false, `${resp.failure} ${resp.message}`);
    return;
  }
  const r = resp.message.result as Record<string, string>;
  for (const [k, v] of Object.entries(r))
    console.log(`      ${k.padEnd(26)} ${v}`);
  const blocked = (k: string) =>
    typeof r[k] === "string" && r[k].startsWith("BLOCKED");
  check("process.env is empty", r.envKeys === "");
  check(
    "getBuiltinModule('child_process') blocked",
    blocked("getBuiltinModule"),
  );
  check("import('node:child_process') blocked", blocked("dynamicImport"));
  check("import('node:fs') blocked after lockdown", blocked("dynamicImportFs"));
  check("process.binding blocked", blocked("binding"));
  check("new Function blocked", blocked("newFunction"));
  check(
    "globalThis.require / fetch removed",
    r.globalRequire === "undefined" && r.fetchType === "undefined",
  );
  check("process.kill(parent) blocked", blocked("killParent"));
  check("process._debugProcess(parent) blocked", blocked("debugParent"));
  check("process.execve blocked", blocked("execve"));
  check(
    "spawning a process blocked (permission model)",
    blocked("capturedSpawn"),
  );
  check(
    "reading /etc/passwd blocked (permission model)",
    blocked("capturedReadPasswd"),
  );
  check("reading /proc/self/environ blocked", blocked("capturedReadEnviron"));
  check(
    "reading the parent's /proc/<ppid>/environ blocked",
    blocked("capturedReadParentEnviron"),
  );
  check("reading the app's .env blocked", blocked("capturedReadDotEnv"));
  check("writing files blocked", blocked("capturedWrite"));
  check("starting a worker thread blocked", blocked("capturedWorker"));
  console.log(
    `      RESIDUAL RISK: a pre-captured net module ${r.capturedNetConnect?.startsWith("OK") ? "CAN" : "cannot"} connect to 127.0.0.1 (Node 22's permission model doesn't cover the network; in-process lockdown makes net unreachable — see report).`,
  );
}

/** RSS watchdog: kill a sandbox whose memory grows past the limit (wasm cap set high on purpose). */
async function adversarialRssWatchdog(): Promise<void> {
  section("Adversarial: RSS watchdog");
  const base = graderConfig();
  const pool = new SandboxPool({
    ...base,
    poolSize: 0,
    wasmMemoryMb: 2048,
    memoryLimitMb: 400,
  });
  const t = performance.now();
  const outcome = await pool.withJob(async (lease) => {
    const proc = await lease.current();
    const r = await proc.request(
      {
        t: "run",
        request: {
          code: "x = []\nwhile True:\n    x.append(bytearray(10**6))",
          stdin: "",
          mode: "io",
        },
      },
      20_000,
    );
    return { r, peak: proc.peakRssBytes };
  });
  check(
    "memory bomb beyond the RSS limit → child killed",
    !outcome.r.ok && outcome.r.failure === "memory",
    `${outcome.r.ok ? "not killed" : outcome.r.failure}, peak ${mb(outcome.peak)}, ${ms(performance.now() - t)}`,
  );
  const after = await pool.withJob(async (lease) => {
    const proc = await lease.current();
    return proc.request(
      { t: "run", request: { code: "print(1+1)", stdin: "", mode: "io" } },
      5000,
    );
  });
  check(
    "pool recovers after a kill",
    after.ok && (after.message.result as { stdout: string }).stdout === "2\n",
  );
  pool.close();
}

/* -------------------------------------------------------------------------- */
/*                                 Performance                                */
/* -------------------------------------------------------------------------- */

async function performanceNumbers(): Promise<void> {
  section("Performance");
  const config = graderConfig();
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const measure = async (snapshotPath: string | null) => {
    const starts: number[] = [];
    const idleRss: number[] = [];
    let fromSnapshot = 0;
    for (let i = 0; i < 3; i++) {
      const t = performance.now();
      const p = new SandboxProcess(config, snapshotPath);
      await p.ready;
      starts.push(performance.now() - t);
      if (p.fromSnapshot) fromSnapshot++;
      await new Promise((r) => setTimeout(r, 200));
      idleRss.push(p.rssBytes());
      p.kill();
    }
    return { starts, idleRss, fromSnapshot };
  };
  const plain = await measure(null);
  console.log(
    `  cold start, normal (spawn → ready):   ${plain.starts.map(ms).join(", ")}  (avg ${ms(avg(plain.starts))})`,
  );
  console.log(
    `  RSS of an idle sandbox (normal):      ${plain.idleRss.map(mb).join(", ")}`,
  );
  const pool = getGraderPool();
  const tSnap = performance.now();
  pool.warmUp();
  for (let i = 0; i < 300 && !pool.snapshot; i++)
    await new Promise((r) => setTimeout(r, 100));
  console.log(
    `  snapshot ready after ${ms(performance.now() - tSnap)} (made once per server process): ${pool.snapshot}`,
  );
  if (pool.snapshot) {
    const snap = await measure(pool.snapshot);
    check("sandboxes start from the snapshot", snap.fromSnapshot === 3);
    console.log(
      `  cold start, snapshot (spawn → ready): ${snap.starts.map(ms).join(", ")}  (avg ${ms(avg(snap.starts))})`,
    );
    console.log(
      `  RSS of an idle sandbox (snapshot):    ${snap.idleRss.map(mb).join(", ")}`,
    );
  }
  const r1 = await runCode({ code: "import random\nprint(random.random())" });
  const r2 = await runCode({ code: "import random\nprint(random.random())" });
  check(
    "random differs between sandboxes (reseeded after snapshot)",
    r1.stdout !== r2.stdout,
    `${r1.stdout.trim()} vs ${r2.stdout.trim()}`,
  );

  const waitWarm = async () => {
    for (
      let i = 0;
      i < 100 && pool.stats().ready < Math.min(config.poolSize, 2);
      i++
    ) {
      await new Promise((r) => setTimeout(r, 100));
    }
  };
  const lat = async (label: string, data: CodeQuestionData, n = 5) => {
    const xs: number[] = [];
    for (let i = 0; i < n; i++) {
      await waitWarm();
      const t = performance.now();
      const r = await gradeCode({
        code: data.solution,
        tests: data.tests,
        checks: data.checks,
        timeLimitMs: data.timeLimitMs,
      });
      xs.push(performance.now() - t);
      if (r.fraction !== 1) console.log("    unexpected result", r.status);
    }
    console.log(
      `  ${label.padEnd(44)} ${xs.map(ms).join(", ")}  (avg ${ms(avg(xs))})`,
    );
  };
  await lat("warm job: hello world (1 test)", helloWorld);
  await lat("warm job: naam (3 io tests)", naam);
  await lat("warm job: gemiddelde (4 function tests + check)", gemiddelde);

  const n = 20;
  await waitWarm();
  const t = performance.now();
  const results = await Promise.all(
    Array.from({ length: n }, () =>
      gradeCode({
        code: naam.solution,
        tests: naam.tests,
        checks: naam.checks,
        timeLimitMs: naam.timeLimitMs,
      }),
    ),
  );
  const total = performance.now() - t;
  check(
    `burst: ${n} simultaneous submissions (pool ${config.poolSize}, concurrency ${config.maxConcurrency})`,
    results.every((r) => r.fraction === 1),
    `${ms(total)} total, ${(n / (total / 1000)).toFixed(1)} jobs/s`,
  );
  console.log(`  pool stats: ${JSON.stringify(pool.stats())}`);
}

/* -------------------------------------------------------------------------- */
/*                         Seeded demo test + batching                        */
/* -------------------------------------------------------------------------- */

/** The seeded demo questions: every code question's model solution must pass. */
function loadSeedQuestions(): { title: string; data: CodeQuestionData }[] {
  return DEMO_QUESTIONS.filter((q) => q.type === "code").map((q) => ({
    title: q.title,
    data: codeQuestionDataSchema.parse(q.data),
  }));
}

async function seedAndBatch(): Promise<void> {
  section("Seeded demo test: every model solution passes all its tests");
  const seeded = loadSeedQuestions();
  const items = seeded.map((q) => ({
    code: q.data.solution,
    tests: q.data.tests,
    checks: q.data.checks,
    timeLimitMs: q.data.timeLimitMs,
  }));
  const batch = await gradeCodeBatch(items);
  seeded.forEach((q, i) => {
    const r = batch[i];
    check(
      `${q.title}`,
      r.fraction === 1,
      `${r.status}, ${r.passedWeight}/${r.totalWeight}`,
    );
    if (r.fraction !== 1) {
      for (const t of r.tests)
        if (!t.passed) console.log(`      [x] ${t.name}: ${t.feedback}`);
      for (const c of r.checks)
        if (!c.passed) console.log(`      [x] check: ${c.message}`);
    }
  });

  section(`Batch grading: one attempt with ${items.length} code questions`);
  const pool = getGraderPool();
  const config = graderConfig();
  const waitWarm = async () => {
    for (
      let i = 0;
      i < 150 && pool.stats().ready < Math.min(config.poolSize, 2);
      i++
    ) {
      await new Promise((r) => setTimeout(r, 100));
    }
  };
  const perQuestion: number[] = [];
  const batched: number[] = [];
  for (let round = 0; round < 3; round++) {
    await waitWarm();
    let t = performance.now();
    for (const item of items) await gradeCode(item);
    perQuestion.push(performance.now() - t);
    await waitWarm();
    t = performance.now();
    await gradeCodeBatch(items);
    batched.push(performance.now() - t);
  }
  console.log(
    `  one job per question (gradeCode × ${items.length}): ${perQuestion.map(ms).join(", ")}`,
  );
  console.log(
    `  one job per attempt (gradeCodeBatch):      ${batched.map(ms).join(", ")}`,
  );
  check(
    "batch is faster than one job per question",
    batched[2] < perQuestion[2],
  );

  // A timeout in the middle: the batch continues in a fresh sandbox, order kept.
  const loop = {
    ...items[0],
    code: "while True:\n    pass",
    timeLimitMs: 1000,
  };
  const mixed = await gradeCodeBatch([items[0], loop, items[1]]);
  check(
    "timeout mid-batch: later questions still graded, order kept",
    mixed[0].fraction === 1 &&
      mixed[1].status === "timeout" &&
      mixed[2].fraction === 1,
    mixed.map((r) => r.status).join(", "),
  );

  // Code of question 1 can't fake the static checks of question 2.
  const tamper = {
    code: [
      "import __main__",
      "def fake(code):",
      "    return {'ok': True, 'constructs': {k: True for k in ['for_loop', 'while_loop', 'if_statement', 'function_def', 'function_call', 'import', 'list_comprehension']}, 'functionDefs': [], 'functionCalls': [], 'imports': []}",
      "__main__._pensuma_analyze = fake",
      "print('klaar')",
    ].join("\n"),
    tests: [],
    checks: [],
    timeLimitMs: 2000,
  };
  const needsFor = {
    code: "print(8)\nprint(22)",
    tests: [],
    checks: codeQuestionDataSchema.parse({
      checks: [{ id: "c", kind: "requires", construct: "for_loop" }],
    }).checks,
    timeLimitMs: 2000,
  };
  const t2 = await gradeCodeBatch([tamper, needsFor]);
  check(
    "one question's code can't fake another question's checks",
    t2[1].checks[0].passed === false,
  );
}

/* -------------------------------------------------------------------------- */
/*          Hidden-test isolation, fair job budget, busy grader queue          */
/* -------------------------------------------------------------------------- */

function ioTest(
  id: string,
  stdin: string,
  expectedOutput: string,
  hidden = false,
): CodeTest {
  return q({
    tests: [{ id, kind: "io", name: id, stdin, expectedOutput, hidden }],
  }).tests[0];
}

const gradeItem = (
  code: string,
  tests: CodeTest[],
  timeLimitMs = 2000,
): GradeInput => ({ code, tests, checks: [], timeLimitMs });

async function reliability(): Promise<void> {
  section("Hidden test inputs never reach student-visible output");
  // Question A stores what input() returns (module attribute + file);
  // question B prints it in a VISIBLE test.
  const store = gradeItem(
    [
      "import sys",
      "naam = input('Naam? ')",
      "sys.__dict__.setdefault('pensuma_seen', []).append(naam)",
      "open('/tmp/seen.txt', 'a').write(naam + '\\n')",
      "print('Hallo ' + naam)",
    ].join("\n"),
    [
      ioTest("zichtbaar", "Mark", "Hallo Mark"),
      ioTest("verborgen", "Fatima", "Hallo Fatima", true),
    ],
  );
  const report = gradeItem(
    [
      "import os, sys",
      "print('Hallo wereld!', getattr(sys, 'pensuma_seen', None))",
      "if os.path.exists('/tmp/seen.txt'):",
      "    print('bestand:', open('/tmp/seen.txt').read().split())",
    ].join("\n"),
    [ioTest("hallo", "", "Hallo wereld!")],
  );
  const [ra, rb] = await gradeCodeBatch([store, report]);
  const shown = redactCodeResultForStudent(rb).tests[0].actual ?? "";
  check(
    "a later question can't print an earlier question's hidden input",
    ra.fraction === 1 && !shown.includes("Fatima"),
    JSON.stringify(shown),
  );
  const [single] = await gradeCodeBatch([
    gradeItem(
      [
        "import sys",
        "seen = list(getattr(sys, 'pensuma_seen2', []))",
        "sys.__dict__.setdefault('pensuma_seen2', []).append(input())",
        "print(seen)",
      ].join("\n"),
      [
        ioTest("verborgen", "Geheim", "[]", true),
        ioTest("zichtbaar", "Open", "[]"),
      ],
    ),
  ]);
  const visible = redactCodeResultForStudent(single).tests[1];
  check(
    "a hidden test stored before a visible one runs after it",
    single.tests[0].testId === "verborgen" &&
      !(visible.actual ?? "").includes("Geheim"),
    JSON.stringify(visible.actual),
  );
  const [files] = await gradeCodeBatch([
    gradeItem(
      [
        "import os",
        "print(os.path.exists('/tmp/notitie.txt'), os.path.exists('/home/pyodide/notitie.txt'))",
        "open('/tmp/notitie.txt', 'w').write('x')",
        "open('/home/pyodide/notitie.txt', 'w').write('x')",
      ].join("\n"),
      [ioTest("a", "", "False False"), ioTest("b", "", "False False")],
    ),
  ]);
  check(
    "files written by one run are gone in the next run of the same job",
    files.fraction === 1,
    files.tests.map((t) => t.actual?.trim()).join(" | "),
  );

  section("One job's time is shared fairly between its questions");
  const savedJobTimeout = process.env.GRADER_JOB_TIMEOUT_MS;
  process.env.GRADER_JOB_TIMEOUT_MS = "6000";
  resetGraderConfig();
  try {
    const honest = (n: number) =>
      gradeItem("print(input())", [
        ioTest(`v${n}`, String(n), String(n)),
        ioTest(`h${n}`, String(n + 1), String(n + 1), true),
      ]);
    const looping = gradeItem(
      "while True:\n    pass",
      Array.from({ length: 6 }, (_, i) => ioTest(`l${i}`, "", "x")),
      1000,
    );
    // Time the job itself, not sandbox cold starts.
    const pool = getGraderPool();
    for (let i = 0; i < 200 && pool.stats().ready < 2; i++)
      await new Promise((r) => setTimeout(r, 100));
    const t0 = performance.now();
    const [rl, r1, r2] = await gradeCodeBatch([looping, honest(1), honest(3)]);
    const took = performance.now() - t0;
    check(
      "an endless loop doesn't cost the other questions their tests",
      r1.fraction === 1 && r2.fraction === 1 && rl.status === "timeout",
      `${rl.status} ${r1.fraction} ${r2.fraction}`,
    );
    // Before: every question had the full budget (6 x (1 s + respawn)).
    check("…and the job ends early", took < 4_500, ms(took));
  } finally {
    if (savedJobTimeout === undefined) delete process.env.GRADER_JOB_TIMEOUT_MS;
    else process.env.GRADER_JOB_TIMEOUT_MS = savedJobTimeout;
    resetGraderConfig();
  }

  section("Background grading waits for a busy grader instead of failing");
  type G = typeof globalThis & { __pensumaGraderPool?: SandboxPool };
  const g = globalThis as G;
  const saved = g.__pensumaGraderPool;
  const busy = new SandboxPool({
    ...graderConfig(),
    poolSize: 1,
    maxConcurrency: 1,
    queueTimeoutMs: 1500,
  });
  g.__pensumaGraderPool = busy;
  try {
    const hog = gradeCodeBatch([
      gradeItem(
        "while True:\n    pass",
        Array.from({ length: 3 }, (_, i) => ioTest(`l${i}`, "", "x")),
        1000,
      ),
    ]);
    await new Promise((r) => setTimeout(r, 200));
    const interactive = gradeCodeBatch([honestItem()]);
    const background = gradeCodeBatch([honestItem()], {
      queueTimeoutMs: null,
      priority: "background",
      throwWhenUnavailable: true,
    });
    const [ri] = await interactive;
    const [rb2] = await background;
    await hog;
    check(
      "an interactive run still gives up after its queue timeout",
      ri.status === "internal_error",
      ri.status,
    );
    check(
      "a submitted attempt is graded once a slot is free",
      rb2.fraction === 1,
      `${rb2.status} ${rb2.fraction}`,
    );
  } finally {
    busy.close();
    g.__pensumaGraderPool = saved;
  }
}

function honestItem(): GradeInput {
  return gradeItem("print('Hallo')", [ioTest("t", "", "Hallo")]);
}

async function main(): Promise<void> {
  const config = graderConfig();
  console.log(
    `node: ${config.nodePath}\npyodide: ${config.pyodideDir}\nsandbox: ${config.sandboxScript}`,
  );
  const only = process.argv[2];
  if (!only || only === "samples") await sampleQuestions();
  if (!only || only === "adversarial") {
    await adversarialPython();
    await adversarialJsEscape();
    await adversarialRssWatchdog();
  }
  if (!only || only === "seed") await seedAndBatch();
  if (!only || only === "reliability") await reliability();
  if (!only || only === "perf") await performanceNumbers();
  getGraderPool().close();
  console.log(`\n${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
