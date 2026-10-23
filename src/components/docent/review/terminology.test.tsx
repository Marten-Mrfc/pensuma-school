import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { FocusLossCaveat } from "./focus-loss-caveat";

/** Teacher review, dashboard and analysis screens (group U3a). */
const ROOTS = ["review", "dashboard", "analysis"].map((dir) =>
  path.resolve(import.meta.dir, "..", dir),
);

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) return sourceFiles(file);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [file] : [];
  });
}

describe("one word for leaving the window: 'vensterwissel' (A41)", () => {
  test("the caveat above the event log says 'vensterwissel'", () => {
    const html = renderToStaticMarkup(<FocusLossCaveat />);
    expect(html).toContain("Een vensterwissel kan ook ontstaan");
    expect(html.toLowerCase()).not.toContain("focusverlies");
  });

  test("no teacher review screen says 'focusverlies'", () => {
    const offenders = ROOTS.flatMap(sourceFiles).filter((file) =>
      /focusverlies/i.test(readFileSync(file, "utf8")),
    );
    expect(offenders.map((f) => path.relative(process.cwd(), f))).toEqual([]);
  });
});
