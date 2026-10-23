import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { compile } from "tailwindcss";
import { ROW_LINK_CLASS, ROW_LIST_CLASS } from "./row-list";

describe("row links in Afgerond and Resultaten keep a visible focus indicator (A04)", () => {
  test("the list does not clip its rows; focus is more than a faint tint", () => {
    expect(ROW_LIST_CLASS).not.toContain("overflow-hidden");
    expect(ROW_LINK_CLASS).toContain("focus-visible:ring-2");
    expect(ROW_LINK_CLASS).toContain("focus-visible:ring-inset");
    expect(ROW_LINK_CLASS).toContain("focus-visible:ring-ring");
  });

  test("the first and last rows round their own corners", async () => {
    const twDir = path.dirname(require.resolve("tailwindcss/package.json"));
    const compiler = await compile(
      '@import "tailwindcss/utilities"; @theme { --radius-xl: 0.3rem; --color-ring: red; }',
      {
        loadStylesheet: async (id, base) => {
          const file = path.join(
            twDir,
            `${id.replace("tailwindcss/", "")}.css`,
          );
          return { content: fs.readFileSync(file, "utf8"), base, path: file };
        },
      },
    );
    const css = compiler.build(ROW_LINK_CLASS.split(" "));
    expect(css).toMatch(/li:first-child > \.[^{]+\{\s*border-top-left-radius/);
    expect(css).toMatch(
      /li:last-child > \.[^{]+\{\s*border-bottom-right-radius/,
    );
    expect(css).toContain("--tw-ring-inset: inset");
  });

  test("both lists use the shared classes", () => {
    for (const file of ["dashboard.tsx", "results-list.tsx"]) {
      const source = fs.readFileSync(path.join(import.meta.dir, file), "utf8");
      expect(source).toContain("className={ROW_LINK_CLASS}");
      expect(source).toContain("className={ROW_LIST_CLASS}");
      expect(source).not.toContain('focus-visible:bg-accent/60"');
    }
  });
});
