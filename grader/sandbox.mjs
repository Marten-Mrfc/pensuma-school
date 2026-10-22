// Pensuma Python sandbox: one child process = one grading job.
//
// Spawned by src/server/grader/sandbox-process.ts as
//
//   node --permission --allow-fs-read=<pyodide dir>/ --allow-fs-read=<this dir>/
//        --disallow-code-generation-from-strings --max-old-space-size=<MB>
//        --no-addons --disable-sigusr1 --no-experimental-fetch
//        --no-experimental-websocket --no-experimental-global-navigator
//        grader/sandbox.mjs <pyodide dir> <wasm memory limit MB>
//
// with `env: {}` (no secrets), cwd = this directory, and stdio pipes.
// This file runs under plain `node` without bundling (keep it dependency-free).
//
// Protocol: newline-delimited JSON. Parent -> child on stdin, child -> parent
// on stdout. Expected outputs/values are NEVER sent here; the child only runs
// code and reports what happened. The parent decides pass/fail.
//
//   parent: {"t":"init","harness":"<python source>","filename":"<pensuma>"}
//   child:  {"t":"ready","loadMs":1234,"rss":123456}
//   parent: {"t":"analyze","id":"1","code":"..."}
//   child:  {"t":"analysis","id":"1","result":{...}}
//   parent: {"t":"run","id":"2","request":{code,stdin,mode,call,maxOutput,recursionLimit}}
//   child:  {"t":"result","id":"2","result":{...}}
//   child:  {"t":"fatal","id":"2","message":"..."}   (interpreter broken; child exits)
//
// THREAT MODEL: student code may escape Pyodide into JavaScript (e.g. via a
// JsProxy) and run arbitrary JS in this process. Defense in depth:
//  1. Process level (enforced by the parent and Node, the real boundary):
//     - env {} (nothing secret in process.env or /proc/self/environ)
//     - Node permission model: fs reads only below the pyodide dir and this
//       dir; no fs writes, no child processes, no workers, no addons, no WASI
//     - --max-old-space-size (JS heap), wasm memory capped below (Python
//       gets MemoryError), and the parent kills the child above an RSS limit
//     - the parent kills the child on timeouts and after every job
//  2. In-process (best effort, reduces what escaped code can reach):
//     - --disallow-code-generation-from-strings: no eval / new Function, so a
//       JsProxy's `.constructor.constructor("...")` can't build new JS
//     - `import js` only sees an empty object (jsglobals), not globalThis
//     - fetch/WebSocket/navigator disabled by flags; XMLHttpRequest,
//       EventSource, require (set by Pyodide) etc. deleted from globalThis
//     - module loading hooks block net/http/https/http2/dgram/tls/dns/
//       child_process/worker_threads/cluster/inspector/... and, after start-up,
//       every further import()/require() (this also kills Pyodide's TCP
//       socket support, which would otherwise import node:net)
//     - process.getBuiltinModule/binding/_linkedBinding/dlopen/kill/_kill/
//       _debugProcess/execve/... replaced with throwing stubs (kill could
//       signal the parent server; _debugProcess could open its inspector)
//
// RESIDUAL RISKS (document for operators):
//  - Node's permission model is a "seat belt", not a hardened security
//    boundary; a Node/V8 bug could let escaped JS bypass it.
//  - The network is NOT covered by the Node 22 permission model. Network
//    access is only removed in-process (globals + module hooks). Escaped JS
//    that still finds a reference to a networking primitive could reach
//    services the app container can reach (e.g. the database). Run the app
//    in a container network that only allows what it needs, or run graders
//    in a separate container without network (see the report / README).
//  - The child runs as the same OS user as the server. Without kill/
//    _debugProcess it has no way to signal the parent from JS, but a Node
//    escape could. Prefer a dedicated container or user for graders.
//  - Pipes: escaped code can write fake protocol lines to stdout. The parent
//    treats everything from the child as untrusted (size caps, strict
//    parsing, its own timing); forging only lets a student lie about its own
//    program's output, never learn expected values.

import fs from "node:fs";
import { registerHooks } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

const PYODIDE_DIR = process.argv[2];
const WASM_MAX_MB = Math.max(64, Number(process.argv[3]) || 512);

/* ----------------------------- Captured handles ---------------------------- */

const stdout = process.stdout;
const stdin = process.stdin;
const stderrWrite = process.stderr.write.bind(process.stderr);
const memoryUsage = process.memoryUsage.bind(process);
const reallyExit = process.exit.bind(process);
const hrNow = () => performance.now();

// Stray console output must never corrupt the protocol on stdout.
let stderrBudget = 64 * 1024;
const logToStderr = (...args) => {
  if (stderrBudget <= 0) return;
  const line = `${args.map((a) => (typeof a === "string" ? a : String(a))).join(" ")}\n`;
  stderrBudget -= line.length;
  stderrWrite(line);
};
for (const k of ["log", "info", "debug", "warn", "error", "trace"])
  console[k] = logToStderr;

function send(obj) {
  stdout.write(`${JSON.stringify(obj)}\n`);
}

/* ------------------------------ Module hooks ------------------------------- */

const ALWAYS_BLOCKED = new Set([
  "child_process",
  "cluster",
  "dgram",
  "diagnostics_channel",
  "dns",
  "dns/promises",
  "http",
  "http2",
  "https",
  "inspector",
  "inspector/promises",
  "net",
  "repl",
  "tls",
  "trace_events",
  "wasi",
  "worker_threads",
  "sqlite",
]);
let locked = false;

registerHooks({
  resolve(specifier, context, nextResolve) {
    const name = specifier.startsWith("node:") ? specifier.slice(5) : specifier;
    if (locked || ALWAYS_BLOCKED.has(name)) {
      throw new Error(`Module '${specifier}' is not available in the sandbox`);
    }
    return nextResolve(specifier, context);
  },
});

/* --------------------- Pre-load shims for the permission model ------------- */

// Pyodide's NODEFS calls process.binding("constants") at start-up, which the
// permission model forbids. Give it only the fs constants.
const fsConstants = Object.freeze({ ...fs.constants });
const deny = (name) =>
  function denied() {
    throw new Error(`${name} is not available in the sandbox`);
  };
process.binding = (name) => {
  if (name === "constants") return { fs: fsConstants };
  throw new Error("process.binding is not available in the sandbox");
};

/* -------------------------- Wasm memory clamping --------------------------- */

// Pyodide's wasm module declares a 4 GB maximum memory. Rewrite the memory
// section's maximum before instantiation, so a Python memory bomb gets a
// MemoryError instead of growing the process (the parent's RSS watchdog is
// the backstop).
function readLeb(bytes, pos) {
  let result = 0;
  let shift = 0;
  let b;
  do {
    b = bytes[pos++];
    result += (b & 0x7f) * 2 ** shift;
    shift += 7;
  } while (b & 0x80);
  return [result, pos];
}
function writeLeb(n) {
  const out = [];
  do {
    let b = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) b |= 0x80;
    out.push(b);
  } while (n > 0);
  return out;
}
function clampWasmMemory(source) {
  let bytes;
  if (source instanceof ArrayBuffer) bytes = new Uint8Array(source);
  else if (ArrayBuffer.isView(source))
    bytes = new Uint8Array(source.buffer, source.byteOffset, source.byteLength);
  else return source;
  if (
    bytes.length < 8 ||
    bytes[0] !== 0 ||
    bytes[1] !== 0x61 ||
    bytes[2] !== 0x73 ||
    bytes[3] !== 0x6d
  )
    return source;
  const maxPages = Math.floor((WASM_MAX_MB * 1024 * 1024) / 65536);
  let pos = 8;
  while (pos < bytes.length) {
    const id = bytes[pos];
    const [size, bodyStart] = readLeb(bytes, pos + 1);
    const bodyEnd = bodyStart + size;
    if (id === 5) {
      let [count, p] = readLeb(bytes, bodyStart);
      if (count < 1) return source;
      const flags = bytes[p++];
      if (flags & 0x04) return source; // memory64: leave alone
      const [initial, afterInitial] = readLeb(bytes, p);
      p = afterInitial;
      let max = null;
      if (flags & 0x01) [max, p] = readLeb(bytes, p);
      if (max !== null && max <= maxPages) return source;
      const newMax = Math.max(initial, maxPages);
      const entry = [flags | 0x01, ...writeLeb(initial), ...writeLeb(newMax)];
      const body = [
        ...writeLeb(count),
        ...entry,
        ...bytes.subarray(p, bodyEnd),
      ];
      const header = [5, ...writeLeb(body.length)];
      const out = new Uint8Array(
        pos + header.length + body.length + (bytes.length - bodyEnd),
      );
      out.set(bytes.subarray(0, pos), 0);
      out.set(header, pos);
      out.set(body, pos + header.length);
      out.set(bytes.subarray(bodyEnd), pos + header.length + body.length);
      return out;
    }
    pos = bodyEnd;
  }
  return source;
}
{
  const W = WebAssembly;
  const origInstantiate = W.instantiate.bind(W);
  const origCompile = W.compile.bind(W);
  const OrigModule = W.Module;
  W.instantiate = (source, imports) =>
    origInstantiate(
      source instanceof OrigModule ? source : clampWasmMemory(source),
      imports,
    );
  W.compile = (source) => origCompile(clampWasmMemory(source));
  const PatchedModule = function Module(source) {
    return new OrigModule(clampWasmMemory(source));
  };
  PatchedModule.prototype = OrigModule.prototype;
  for (const k of ["imports", "exports", "customSections"])
    PatchedModule[k] = OrigModule[k];
  W.Module = PatchedModule;
  if (W.instantiateStreaming)
    W.instantiateStreaming = async (resp, imports) =>
      origInstantiate(
        clampWasmMemory(await (await resp).arrayBuffer()),
        imports,
      );
  if (W.compileStreaming)
    W.compileStreaming = async (resp) =>
      origCompile(clampWasmMemory(await (await resp).arrayBuffer()));
}

/* ---------------------------------- Lockdown -------------------------------- */

function lockdown() {
  locked = true;
  for (const k of [
    "require",
    "fetch",
    "WebSocket",
    "XMLHttpRequest",
    "EventSource",
    "navigator",
    "Request",
    "Response",
    "Headers",
    "FormData",
    "BroadcastChannel",
    "MessageChannel",
    "MessagePort",
    "Worker",
    "SharedWorker",
    "importScripts",
  ]) {
    try {
      delete globalThis[k];
    } catch {
      // ignore
    }
    if (k in globalThis) {
      try {
        Object.defineProperty(globalThis, k, {
          value: undefined,
          configurable: false,
          writable: false,
        });
      } catch {
        // ignore
      }
    }
  }
  const stubs = [
    "getBuiltinModule",
    "binding",
    "_linkedBinding",
    "dlopen",
    "kill",
    "_kill",
    "_debugProcess",
    "_debugEnd",
    "_startProfilerIdleNotifier",
    "_stopProfilerIdleNotifier",
    "execve",
    "loadEnvFile",
    "openStdin",
    "chdir",
    "umask",
    "abort",
    "setuid",
    "setgid",
    "seteuid",
    "setegid",
    "setgroups",
    "initgroups",
    "setUncaughtExceptionCaptureCallback",
    "setSourceMapsEnabled",
  ];
  for (const k of stubs) {
    try {
      Object.defineProperty(process, k, {
        value: deny(`process.${k}`),
        configurable: false,
        writable: false,
      });
    } catch {
      // ignore
    }
  }
  try {
    Object.defineProperty(process, "env", {
      value: Object.freeze({}),
      configurable: false,
      writable: false,
    });
  } catch {
    // ignore
  }
}

/* ---------------------------------- Main ------------------------------------ */

const queue = [];
let wake = null;
let inputBuffer = "";
stdin.setEncoding("utf8");
stdin.on("data", (chunk) => {
  inputBuffer += chunk;
  let nl = inputBuffer.indexOf("\n");
  while (nl >= 0) {
    const line = inputBuffer.slice(0, nl);
    inputBuffer = inputBuffer.slice(nl + 1);
    if (line.trim()) {
      try {
        queue.push(JSON.parse(line));
      } catch {
        // ignore malformed lines
      }
    }
    nl = inputBuffer.indexOf("\n");
  }
  if (wake && queue.length) {
    const w = wake;
    wake = null;
    w();
  }
});
// Parent gone (or closed our stdin): exit.
stdin.on("end", () => reallyExit(0));
stdin.on("error", () => reallyExit(0));

async function nextMessage() {
  while (queue.length === 0) await new Promise((r) => (wake = r));
  return queue.shift();
}

function sendRaw(prefix, json) {
  stdout.write(`${prefix}${json}}\n`);
}

async function main() {
  const t0 = hrNow();
  const { loadPyodide } = await import(
    pathToFileURL(path.join(PYODIDE_DIR, "pyodide.mjs")).href
  );
  const sink = () => {};
  const pyodide = await loadPyodide({
    indexURL: `${PYODIDE_DIR.replace(/\/$/, "")}/`,
    jsglobals: Object.freeze(Object.create(null)),
    stdout: sink,
    stderr: sink,
    env: { HOME: "/home/pyodide" },
  });
  pyodide.setStdin({ error: true });

  // Wait for the harness from the parent.
  let init = await nextMessage();
  while (init.t !== "init") init = await nextMessage();
  pyodide.runPython(init.harness, { filename: init.filename || "<pensuma>" });
  const runJson = pyodide.globals.get("_pensuma_run_json");
  const analyzeJson = pyodide.globals.get("_pensuma_analyze_json");

  lockdown();
  send({
    t: "ready",
    loadMs: Math.round(hrNow() - t0),
    rss: memoryUsage().rss,
  });

  for (;;) {
    const msg = await nextMessage();
    const id = typeof msg.id === "string" ? msg.id : String(msg.id ?? "");
    try {
      if (msg.t === "analyze") {
        const json = analyzeJson(String(msg.code ?? ""));
        sendRaw(`{"t":"analysis","id":${JSON.stringify(id)},"result":`, json);
      } else if (msg.t === "run") {
        const json = runJson(JSON.stringify(msg.request ?? {}));
        sendRaw(`{"t":"result","id":${JSON.stringify(id)},"result":`, json);
      } else if (msg.t === "ping") {
        send({ t: "pong", id, rss: memoryUsage().rss });
      }
    } catch (e) {
      // Errors escaping the harness mean the interpreter itself failed
      // (e.g. a JS stack overflow). It can't be trusted any more: report and exit.
      send({ t: "fatal", id, message: String(e?.message ?? e).slice(0, 2000) });
      reallyExit(3);
    }
  }
}

main().catch((e) => {
  try {
    send({
      t: "fatal",
      id: "",
      message: `start-up failed: ${String(e?.stack ?? e).slice(0, 2000)}`,
    });
  } finally {
    reallyExit(2);
  }
});
