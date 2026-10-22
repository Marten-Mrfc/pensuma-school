#!/usr/bin/env node
// Copy the Pyodide runtime from node_modules/pyodide to public/pyodide, so the
// browser loads it from our own origin (needed for cross-origin isolation and
// for schools that block CDNs). Runs on postinstall, predev and prebuild.
// Skips files that are already up to date. Plain Node, no dependencies.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const src = path.join(root, "node_modules", "pyodide");
const dest = path.join(root, "public", "pyodide");

const FILES = [
  "pyodide.mjs",
  "pyodide.asm.mjs",
  "pyodide.asm.wasm",
  "python_stdlib.zip",
  "pyodide-lock.json",
  "package.json",
];

if (!fs.existsSync(path.join(src, "pyodide.mjs"))) {
  console.warn("[pyodide:copy] node_modules/pyodide not found, skipping");
  process.exit(0);
}

fs.mkdirSync(dest, { recursive: true });
let copied = 0;
for (const file of FILES) {
  const from = path.join(src, file);
  const to = path.join(dest, file);
  if (!fs.existsSync(from)) {
    console.warn(`[pyodide:copy] missing ${file} in node_modules/pyodide`);
    continue;
  }
  const a = fs.statSync(from);
  const b = fs.existsSync(to) ? fs.statSync(to) : null;
  if (b && b.size === a.size && b.mtimeMs >= a.mtimeMs) continue;
  fs.copyFileSync(from, to);
  fs.utimesSync(to, a.atime, a.mtime);
  copied++;
}
const version = JSON.parse(
  fs.readFileSync(path.join(src, "package.json"), "utf8"),
).version;
console.log(
  `[pyodide:copy] public/pyodide is up to date (pyodide ${version}, ${copied} file(s) copied)`,
);
