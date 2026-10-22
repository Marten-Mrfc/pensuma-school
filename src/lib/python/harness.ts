/**
 * The Pensuma Python harness: one Python source, used by BOTH the browser
 * worker (`public/python-worker.mjs`) and the server sandbox (`grader/sandbox.mjs`,
 * which receives this source from the parent process at start-up), so the
 * semantics of running and grading student code are identical everywhere.
 *
 * What the harness does
 * - `input(prompt)` returns the next stdin line. The prompt is NOT written to
 *   the clean stdout (that is the core fix of this app); the transcript
 *   records the prompt and the echoed value like a real terminal. On EOF it
 *   raises `EOFError` with a Dutch message.
 * - stdout/stderr are captured (capped at `maxOutput` characters, then the
 *   program is stopped with a Dutch note).
 * - Exceptions become a `PythonError` (type, message, student line number and
 *   a traceback without harness frames). Syntax errors are detected by
 *   `analyze` before any test runs.
 * - io run: exec the code in fresh globals `{"__name__": "__main__"}`.
 * - function run: exec the code as a module (`__name__ == "main"`, so code
 *   under `if __name__ == "__main__":` does not run) with empty stdin, then
 *   eval the teacher's `call` expression and serialize the return value as
 *   type-tagged JSON (`PyValue`).
 * - `analyze` parses the code with `ast` (never executes it) and reports
 *   which constructs are used, for the static checks.
 *
 * SECURITY: the harness never receives expected outputs or expected values.
 * All pass/fail decisions are made in TypeScript (`src/lib/grading/*`),
 * outside the interpreter. Expected values (`FunctionTest.expected`) are
 * parsed by a TypeScript Python-literal parser (`src/lib/grading/pyvalue.ts`).
 */

import type { PyValue } from "@/lib/grading/pyvalue";
import type { PythonError } from "@/lib/questions/schema";
import type { TranscriptSegment } from "./types";

/** Default cap for captured output per run (characters). */
export const DEFAULT_MAX_OUTPUT = 64 * 1024;
/** Default Python recursion limit during student runs. */
export const DEFAULT_RECURSION_LIMIT = 1000;

export const EOF_MESSAGE =
  "Je programma vraagt vaker om invoer (input) dan er invoer is gegeven.";

/* -------------------------------------------------------------------------- */
/*                               Protocol types                               */
/* -------------------------------------------------------------------------- */

export type HarnessRunMode = "io" | "function";

export type HarnessRunRequest = {
  code: string;
  /** Lines for `input()`, separated by "\n". Ignored in interactive mode. */
  stdin: string;
  mode: HarnessRunMode;
  /** function mode: the Python expression to evaluate, e.g. `f([1, 2])`. */
  call?: string;
  maxOutput?: number;
  recursionLimit?: number;
};

export type HarnessValue = {
  value: PyValue;
  /** `repr()` of the value (truncated), for display. */
  repr: string;
};

export type HarnessRunResult = {
  /** Clean stdout (no input prompts). */
  stdout: string;
  stderr: string;
  /** Terminal-style transcript: stdout, stderr, prompts and echoed input. */
  transcript: string;
  segments: TranscriptSegment[];
  /** Uncaught exception (io), or exception of the `call` (function mode). */
  error: PythonError | null;
  /** function mode: exception raised while running the module itself. */
  moduleError: PythonError | null;
  /** function mode: the serialized return value (null when the call failed). */
  value: HarnessValue | null;
  /** True when the output cap was hit and the program was stopped. */
  truncated: boolean;
};

export type HarnessAnalysis =
  | {
      ok: true;
      constructs: {
        for_loop: boolean;
        while_loop: boolean;
        if_statement: boolean;
        function_def: boolean;
        function_call: boolean;
        import: boolean;
        list_comprehension: boolean;
      };
      /** Names of `def`-ined functions (incl. methods). */
      functionDefs: string[];
      /** Called names: dotted (`math.sqrt`, `lijst.append`) and the last part. */
      functionCalls: string[];
      /** Imported modules: full dotted name and each parent (`os.path`, `os`). */
      imports: string[];
    }
  | { ok: false; error: PythonError };

/* -------------------------------------------------------------------------- */
/*                                Python source                               */
/* -------------------------------------------------------------------------- */

/**
 * Python source of the harness. Run it once per interpreter with the file
 * name `HARNESS_FILENAME`; it defines `_pensuma_run_json(request_json, emit,
 * reader)` and `_pensuma_analyze_json(code)` in the interpreter's globals.
 *
 * - `emit(kind, text)` (optional) is called for every transcript segment as it
 *   happens (kind: stdout | stderr | prompt | input).
 * - `reader(prompt)` (optional) returns the next input line, or None/undefined
 *   for EOF. When absent, lines come from `request.stdin`.
 */
export const HARNESS_FILENAME = "<pensuma>";

export const HARNESS_PY = String.raw`
import ast as _ast
import builtins as _builtins
import io as _io
import json as _json
import linecache as _linecache
import math as _math
import os as _os
import random as _random
import sys as _sys
import traceback as _traceback

# Interpreters may start from a memory snapshot: give each one fresh randomness.
_random.seed()

_STUDENT_FILE = "main.py"
_TEST_FILE = "<test>"
_HARNESS_FILE = "${HARNESS_FILENAME}"
_EOF_MESSAGE = "${EOF_MESSAGE}"
_OUTPUT_NOTE = "\n... (uitvoer ingekort: je programma printte te veel tekst)\n"

# Keep private references, so student code that patches modules can't break
# the harness for later runs (it can only lie about its own output).
_dumps = _json.dumps
_loads = _json.loads
_extract_tb = _traceback.extract_tb
_format_exception_only = _traceback.format_exception_only
_StackSummary = _traceback.StackSummary
_isnan = _math.isnan
_isinf = _math.isinf
_orig_builtins = dict(_builtins.__dict__)
_orig_modules = set(_sys.modules)
_orig_stdout = _sys.stdout
_orig_stderr = _sys.stderr
_orig_stdin = _sys.stdin
_orig_recursion = _sys.getrecursionlimit()
_orig_setrecursionlimit = _sys.setrecursionlimit
# Deeper recursion overflows the JavaScript stack under Pyodide, which is a
# fatal (and slow) interpreter crash instead of a RecursionError.
_MAX_RECURSION = 3000


def _capped_setrecursionlimit(limit):
    _orig_setrecursionlimit(max(50, min(int(limit), _MAX_RECURSION)))
_orig_cwd = _os.getcwd()
_run_counter = [0]


class _OutputLimit(BaseException):
    """Raised when the output cap is hit. BaseException: not caught by 'except Exception'."""


class _Capture:
    def __init__(self, max_output, emit):
        self.stdout = []
        self.stderr = []
        self.segments = []
        self.size = 0
        self.max = max_output
        self.truncated = False
        self.emit = emit

    def add(self, kind, text):
        if self.truncated:
            raise _OutputLimit()
        if not text:
            return
        remaining = self.max - self.size
        if len(text) > remaining:
            text = text[: max(remaining, 0)]
            self.truncated = True
        self.size += len(text)
        if text:
            if kind == "stdout":
                self.stdout.append(text)
            elif kind == "stderr":
                self.stderr.append(text)
            if self.segments and self.segments[-1][0] == kind:
                self.segments[-1][1] += text
            else:
                self.segments.append([kind, text])
            if self.emit is not None:
                self.emit(kind, text)
        if self.truncated:
            raise _OutputLimit()


class _Writer(_io.TextIOBase):
    def __init__(self, cap, kind):
        self._cap = cap
        self._kind = kind

    def write(self, s):
        if not isinstance(s, str):
            raise TypeError("write() argument must be str, not " + type(s).__name__)
        self._cap.add(self._kind, s)
        return len(s)

    def writable(self):
        return True

    def readable(self):
        return False

    def flush(self):
        pass

    def isatty(self):
        return False

    @property
    def encoding(self):
        return "utf-8"

    @property
    def errors(self):
        return "strict"


class _Reader(_io.TextIOBase):
    def __init__(self, next_line):
        self._next_line = next_line

    def readable(self):
        return True

    def writable(self):
        return False

    def isatty(self):
        return False

    @property
    def encoding(self):
        return "utf-8"

    def readline(self, size=-1):
        line = self._next_line("")
        if line is None:
            return ""
        return line + "\n"

    def read(self, size=-1):
        parts = []
        while True:
            line = self._next_line("")
            if line is None:
                break
            parts.append(line + "\n")
        return "".join(parts)

    def readlines(self, hint=-1):
        return [l for l in iter(self.readline, "")]

    def __iter__(self):
        return self

    def __next__(self):
        line = self.readline()
        if not line:
            raise StopIteration
        return line


def _split_stdin(stdin):
    if not stdin:
        return []
    lines = stdin.replace("\r\n", "\n").replace("\r", "\n").split("\n")
    if lines and lines[-1] == "":
        lines.pop()
    return lines


def _format_error(exc, error_type=None):
    """Convert an exception into a PythonError dict (harness frames removed)."""
    etype = error_type or type(exc).__name__
    if isinstance(exc, SyntaxError):
        line = exc.lineno if exc.filename == _STUDENT_FILE else None
        try:
            tb = "".join(_format_exception_only(type(exc), exc))
        except Exception:
            tb = etype + ": " + str(exc)
        return {"type": etype, "message": str(exc.msg or exc), "line": line, "traceback": tb[:8000]}
    frames = [f for f in _extract_tb(exc.__traceback__) if f.filename not in (_HARNESS_FILE, _TEST_FILE)]
    line = None
    for f in frames:
        if f.filename == _STUDENT_FILE:
            line = f.lineno
    try:
        message = str(exc)
    except Exception:
        message = ""
    try:
        body = "".join(_StackSummary.from_list(frames).format()) if frames else ""
        tail = "".join(_format_exception_only(type(exc), exc))
    except Exception:
        body, tail = "", etype + ": " + message + "\n"
    tb = ("Traceback (most recent call last):\n" + body if body else "") + tail
    if len(tb) > 8000:
        tb = tb[:3000] + "\n...\n" + tb[-4000:]
    return {"type": etype, "message": message[:2000], "line": line, "traceback": tb}


def _output_limit_error(max_output):
    kb = max_output // 1024
    return {
        "type": "OutputLimitExceeded",
        "message": "Je programma printte te veel tekst (meer dan " + str(kb) + " KB). Het is gestopt en de uitvoer is ingekort.",
        "line": None,
        "traceback": "",
    }


_MAX_ITEMS = 10000
_MAX_DEPTH = 50


def _serialize(v, budget, depth, active):
    """Type-tagged canonical JSON for a Python value (see PyValue in TypeScript)."""
    budget[0] -= 1
    if budget[0] < 0 or depth > _MAX_DEPTH:
        return {"t": "other", "type": type(v).__name__, "repr": "..."}
    if v is None:
        return {"t": "none"}
    tp = type(v)
    if tp is bool:
        return {"t": "bool", "v": v}
    if tp is int or (isinstance(v, int) and not isinstance(v, bool)):
        try:
            return {"t": "int", "v": int.__repr__(int(v))}
        except ValueError:
            return {"t": "other", "type": "int", "repr": "<heel groot getal>"}
    if tp is float or isinstance(v, float):
        f = float(v)
        if _isnan(f):
            return {"t": "float", "v": "nan"}
        if _isinf(f):
            return {"t": "float", "v": "inf" if f > 0 else "-inf"}
        return {"t": "float", "v": f}
    if tp is complex:
        return {"t": "other", "type": "complex", "repr": repr(v)}
    if tp is str or isinstance(v, str):
        return {"t": "str", "v": str.__str__(v)}
    if tp is bytes:
        return {"t": "bytes", "v": v.decode("latin-1")}
    key = id(v)
    if key in active:
        return {"t": "other", "type": tp.__name__, "repr": "[...]"}
    if isinstance(v, (list, tuple, set, frozenset, dict)):
        active.add(key)
        try:
            if isinstance(v, dict):
                items = [[_serialize(k, budget, depth + 1, active), _serialize(x, budget, depth + 1, active)] for k, x in list(dict.items(v))]
                return {"t": "dict", "v": items}
            if isinstance(v, list):
                return {"t": "list", "v": [_serialize(x, budget, depth + 1, active) for x in list.__iter__(v)]}
            if isinstance(v, tuple):
                return {"t": "tuple", "v": [_serialize(x, budget, depth + 1, active) for x in tuple.__iter__(v)]}
            name = "frozenset" if isinstance(v, frozenset) else "set"
            return {"t": name, "v": [_serialize(x, budget, depth + 1, active) for x in list(v)]}
        finally:
            active.discard(key)
    try:
        r = repr(v)
    except BaseException:
        r = "<" + tp.__name__ + ">"
    return {"t": "other", "type": tp.__name__, "repr": r[:2000]}


def _restore_interpreter():
    _sys.stdout = _orig_stdout
    _sys.stderr = _orig_stderr
    _sys.stdin = _orig_stdin
    _sys.setrecursionlimit = _orig_setrecursionlimit
    try:
        _orig_setrecursionlimit(_orig_recursion)
    except Exception:
        pass
    # Undo changes to builtins and imported modules, so runs can't affect each other.
    d = _builtins.__dict__
    for k in list(d):
        if k not in _orig_builtins:
            del d[k]
    d.update(_orig_builtins)
    for name in list(_sys.modules):
        if name not in _orig_modules:
            del _sys.modules[name]
    try:
        _os.chdir(_orig_cwd)
    except Exception:
        pass


def _make_workdir():
    _run_counter[0] += 1
    path = "/tmp/pensuma-run-" + str(_run_counter[0])
    try:
        _os.makedirs(path, exist_ok=True)
        _os.chdir(path)
    except Exception:
        pass


def _pensuma_run(req, emit=None, reader=None):
    code = req.get("code", "")
    mode = req.get("mode", "io")
    call = req.get("call")
    max_output = int(req.get("maxOutput") or 65536)
    recursion_limit = int(req.get("recursionLimit") or 1000)

    cap = _Capture(max_output, emit)
    lines = _split_stdin("" if mode == "function" else req.get("stdin", ""))
    pos = [0]

    def next_line(prompt):
        if reader is not None and mode != "function":
            v = reader(prompt)
            return None if v is None else str(v)
        if pos[0] < len(lines):
            v = lines[pos[0]]
            pos[0] += 1
            return v
        return None

    def _input(prompt=""):
        prompt = str(prompt)
        if prompt:
            cap.add("prompt", prompt)
        line = next_line(prompt)
        if line is None:
            raise EOFError(_EOF_MESSAGE)
        cap.add("input", line + "\n")
        return line

    error = None
    module_error = None
    value = None
    truncated = False

    _linecache.cache[_STUDENT_FILE] = (len(code), None, code.splitlines(True), _STUDENT_FILE)
    try:
        _sys.stdout = _Writer(cap, "stdout")
        _sys.stderr = _Writer(cap, "stderr")
        _sys.stdin = _Reader(next_line)
        _builtins.input = _input
        _sys.setrecursionlimit = _capped_setrecursionlimit
        _make_workdir()
        g = {"__name__": "main" if mode == "function" else "__main__", "__builtins__": _builtins}
        try:
            compiled = compile(code, _STUDENT_FILE, "exec", dont_inherit=True)
            _capped_setrecursionlimit(recursion_limit)
            exec(compiled, g)
        except SystemExit as e:
            if e.code not in (None, 0) and not isinstance(e.code, int):
                try:
                    cap.add("stderr", str(e.code) + "\n")
                except _OutputLimit:
                    truncated = True
        except _OutputLimit:
            truncated = True
        except KeyboardInterrupt as e:
            error = _format_error(e, "KeyboardInterrupt")
        except BaseException as e:
            error = _format_error(e)

        if mode == "function" and not truncated:
            module_error = error
            error = None
            try:
                expr = compile(call or "None", _TEST_FILE, "eval", dont_inherit=True)
                _capped_setrecursionlimit(recursion_limit)
                result = eval(expr, g)
                _orig_setrecursionlimit(_orig_recursion)
                ser = _serialize(result, [_MAX_ITEMS], 0, set())
                try:
                    r = repr(result)
                except BaseException:
                    r = "<" + type(result).__name__ + ">"
                if len(r) > 2000:
                    r = r[:2000] + "..."
                value = {"value": ser, "repr": r}
            except _OutputLimit:
                truncated = True
            except SystemExit:
                error = {"type": "SystemExit", "message": "Je functie riep exit() aan.", "line": None, "traceback": ""}
            except BaseException as e:
                error = _format_error(e)
    finally:
        _restore_interpreter()

    if truncated:
        cap.truncated = False
        cap.max = cap.size + len(_OUTPUT_NOTE)
        try:
            cap.add("stderr", _OUTPUT_NOTE)
        except _OutputLimit:
            pass
        error = _output_limit_error(max_output)

    segments = [{"kind": k, "text": t} for k, t in cap.segments]
    return {
        "stdout": "".join(cap.stdout),
        "stderr": "".join(cap.stderr),
        "transcript": "".join(t for _, t in cap.segments),
        "segments": segments,
        "error": error,
        "moduleError": module_error,
        "value": value,
        "truncated": truncated,
    }


def _pensuma_run_json(request_json, emit=None, reader=None):
    try:
        req = _loads(request_json)
        return _dumps(_pensuma_run(req, emit, reader), ensure_ascii=False, allow_nan=False)
    except BaseException as e:
        _restore_interpreter()
        return _dumps({"internalError": type(e).__name__ + ": " + str(e)})


def _dotted(node):
    parts = []
    while isinstance(node, _ast.Attribute):
        parts.append(node.attr)
        node = node.value
    if isinstance(node, _ast.Name):
        parts.append(node.id)
    elif parts:
        parts.append("")
    else:
        return None
    return ".".join(reversed(parts))


def _pensuma_analyze(code):
    try:
        # A full compile (no execution) also catches errors that ast.parse
        # accepts, such as 'return' outside a function.
        compile(code, _STUDENT_FILE, "exec", dont_inherit=True)
        tree = _ast.parse(code, _STUDENT_FILE)
    except (SyntaxError, ValueError) as e:
        if isinstance(e, SyntaxError):
            return {"ok": False, "error": _format_error(e)}
        return {"ok": False, "error": {"type": "SyntaxError", "message": str(e), "line": None, "traceback": ""}}
    except RecursionError as e:
        return {"ok": False, "error": {"type": "RecursionError", "message": "Je code is te diep genest om te lezen.", "line": None, "traceback": ""}}
    constructs = {
        "for_loop": False,
        "while_loop": False,
        "if_statement": False,
        "function_def": False,
        "function_call": False,
        "import": False,
        "list_comprehension": False,
    }
    defs, calls, imports = [], [], []
    for node in _ast.walk(tree):
        if isinstance(node, (_ast.For, _ast.AsyncFor)):
            constructs["for_loop"] = True
        elif isinstance(node, _ast.While):
            constructs["while_loop"] = True
        elif isinstance(node, _ast.If):
            constructs["if_statement"] = True
        elif isinstance(node, (_ast.FunctionDef, _ast.AsyncFunctionDef)):
            constructs["function_def"] = True
            defs.append(node.name)
        elif isinstance(node, _ast.Call):
            constructs["function_call"] = True
            name = _dotted(node.func)
            if name:
                calls.append(name)
                last = name.rsplit(".", 1)[-1]
                if last != name:
                    calls.append(last)
        elif isinstance(node, _ast.Import):
            constructs["import"] = True
            for alias in node.names:
                parts = alias.name.split(".")
                for i in range(1, len(parts) + 1):
                    imports.append(".".join(parts[:i]))
        elif isinstance(node, _ast.ImportFrom):
            constructs["import"] = True
            if node.module and not node.level:
                parts = node.module.split(".")
                for i in range(1, len(parts) + 1):
                    imports.append(".".join(parts[:i]))
        elif isinstance(node, _ast.ListComp):
            constructs["list_comprehension"] = True

    def uniq(xs):
        seen = []
        for x in xs:
            if x not in seen:
                seen.append(x)
        return seen

    return {
        "ok": True,
        "constructs": constructs,
        "functionDefs": uniq(defs),
        "functionCalls": uniq(calls),
        "imports": uniq(imports),
    }


def _pensuma_analyze_json(code):
    try:
        return _dumps(_pensuma_analyze(code), ensure_ascii=False)
    except BaseException as e:
        return _dumps({"internalError": type(e).__name__ + ": " + str(e)})
`;
