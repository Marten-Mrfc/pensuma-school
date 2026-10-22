// Pensuma browser Python worker (plain ES module, NOT bundled).
//
// Started by src/lib/python/runner-client.ts as
//   new Worker("/python-worker.mjs", { type: "module" })
// It is a static file on purpose: Turbopack turns bundled workers into
// classic workers (importScripts), and Pyodide refuses to run in classic
// workers. A static module worker also behaves the same in `next dev`,
// `next build` / standalone, and under a CSP with `worker-src 'self'`.
//
// Pyodide is loaded from the self-hosted /pyodide/ folder (copied from
// node_modules by scripts/copy-pyodide.mjs). The Python harness source (the
// same one the server sandbox uses, src/lib/python/harness.ts) arrives in the
// "init" message, so browser and server semantics stay identical.
//
// Protocol: see src/lib/python/worker-protocol.ts.
//   main -> worker: {t:"init", indexURL, harness, filename, inputBuffer}
//                   {t:"analyze", id, code}
//                   {t:"run", id, request, interactive}
//   worker -> main: {t:"ready", loadMs} | {t:"load-error", message}
//                   {t:"started", id} | {t:"segments", id, segments}
//                   {t:"input-request", id, prompt}
//                   {t:"analysis", id, result} | {t:"result", id, result}
//                   {t:"fatal", id, message}
// Interactive input: SharedArrayBuffer [Int32 state, Int32 byteLength, bytes...].

const INPUT_STATE_IDLE = 0;
const INPUT_STATE_DATA = 1;
const INPUT_STATE_EOF = 2;

let runJson = null;
let analyzeJson = null;
let inputCtrl = null;
let inputData = null;
const decoder = new TextDecoder();

function post(message) {
  self.postMessage(message);
}

function errorMessage(e) {
  return e instanceof Error ? e.message : String(e);
}

async function init(msg) {
  const t0 = performance.now();
  try {
    const { loadPyodide } = await import(`${msg.indexURL}pyodide.mjs`);
    const pyodide = await loadPyodide({
      indexURL: msg.indexURL,
      stdout: () => {},
      stderr: () => {},
      env: { HOME: "/home/pyodide" },
    });
    pyodide.setStdin({ error: true });
    pyodide.runPython(msg.harness, { filename: msg.filename || "<pensuma>" });
    runJson = pyodide.globals.get("_pensuma_run_json");
    analyzeJson = pyodide.globals.get("_pensuma_analyze_json");
    if (msg.inputBuffer) {
      inputCtrl = new Int32Array(msg.inputBuffer, 0, 2);
      inputData = new Uint8Array(msg.inputBuffer, 8);
    }
    post({ t: "ready", loadMs: Math.round(performance.now() - t0) });
  } catch (e) {
    post({ t: "load-error", message: errorMessage(e) });
  }
}

function run(id, request, interactive) {
  if (!runJson) {
    post({ t: "fatal", id, message: "Python is not loaded" });
    return;
  }
  // Every write is posted immediately: the worker may be terminated at any
  // moment (time limit, Stoppen), and output printed before an endless loop
  // must not be lost. Output is capped by the harness (64 KB), and the main
  // thread coalesces UI updates per animation frame.
  const flush = () => {};
  const emit = (kind, text) => {
    post({ t: "segments", id, segments: [{ kind, text }] });
  };
  const ctrl = inputCtrl;
  const data = inputData;
  const reader =
    interactive && ctrl && data
      ? (prompt) => {
          flush();
          Atomics.store(ctrl, 0, INPUT_STATE_IDLE);
          post({ t: "input-request", id, prompt });
          Atomics.wait(ctrl, 0, INPUT_STATE_IDLE);
          const state = Atomics.load(ctrl, 0);
          Atomics.store(ctrl, 0, INPUT_STATE_IDLE);
          if (state === INPUT_STATE_EOF || state !== INPUT_STATE_DATA)
            return undefined;
          const length = Math.min(Atomics.load(ctrl, 1), data.length);
          // slice() copies out of the SharedArrayBuffer (TextDecoder refuses shared views).
          return decoder.decode(data.slice(0, length));
        }
      : undefined;
  post({ t: "started", id });
  try {
    const json = runJson(JSON.stringify(request), emit, reader);
    flush();
    post({ t: "result", id, result: JSON.parse(json) });
  } catch (e) {
    flush();
    // The interpreter itself failed (e.g. a JS stack overflow); the main
    // thread replaces this worker.
    post({ t: "fatal", id, message: errorMessage(e) });
  }
}

self.onmessage = (event) => {
  const msg = event.data;
  switch (msg?.t) {
    case "init":
      void init(msg);
      break;
    case "analyze":
      if (!analyzeJson) {
        post({ t: "fatal", id: msg.id, message: "Python is not loaded" });
        return;
      }
      try {
        post({
          t: "analysis",
          id: msg.id,
          result: JSON.parse(analyzeJson(String(msg.code ?? ""))),
        });
      } catch (e) {
        post({ t: "fatal", id: msg.id, message: errorMessage(e) });
      }
      break;
    case "run":
      run(msg.id, msg.request ?? {}, msg.interactive === true);
      break;
  }
};
