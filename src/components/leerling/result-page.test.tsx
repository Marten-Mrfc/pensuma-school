import { describe, expect, test } from "bun:test";
import fs from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { compile } from "tailwindcss";
import { QUESTION_ITEM_FOCUS_CLASS, QuestionAccordion } from "./result-page";

type Props = Parameters<typeof QuestionAccordion>[0];

const question = {
  id: "q1",
  position: 2,
  type: "open",
  title: "Begroeting",
  points: 2,
  earned: null,
  answered: false,
  reviewed: false,
  neutralized: false,
  status: "pending",
  hints: null,
} as unknown as Props["questions"][number];

function render() {
  return renderToStaticMarkup(
    <QuestionAccordion questions={[question]} solutions={{}} />,
  );
}

const decode = (tag: string | undefined) => tag?.replace(/&gt;/g, ">");

describe("result page question rows: visible keyboard focus (A04)", () => {
  test("the clipping card draws an outline while its own trigger has focus", () => {
    const html = render();
    const item = decode(
      html.match(/<div[^>]*data-slot="accordion-item"[^>]*>/)?.[0],
    );
    expect(item).toBeDefined();
    expect(item).toContain("overflow-hidden");
    for (const cls of QUESTION_ITEM_FOCUS_CLASS.split(" ")) {
      expect(item).toContain(cls);
    }
    // No second (clipped, invisible) ring on the trigger itself.
    const trigger = html.match(
      /<button[^>]*data-slot="accordion-trigger"[^>]*>/,
    )?.[0];
    expect(trigger).toContain("focus-visible:ring-0");
    expect(trigger).not.toContain("focus-visible:ring-2");
  });

  test("the classes compile to an outline on the item, scoped to its trigger", async () => {
    const twDir = path.dirname(require.resolve("tailwindcss/package.json"));
    // The app's theme defines --color-ring (globals.css); a stand-in will do.
    const compiler = await compile(
      '@import "tailwindcss/utilities"; @theme { --color-ring: oklch(0.5 0.1 150); }',
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
    const css = compiler.build(QUESTION_ITEM_FOCUS_CLASS.split(" "));
    const scope =
      ":has( > [data-slot=accordion-header] > [data-slot=accordion-trigger]:focus-visible)";
    expect(css).toContain(scope);
    expect(css).toMatch(/outline-width:\s*2px/);
    expect(css).toMatch(/outline-offset:\s*2px/);
    expect(css).toContain("outline-color: var(--color-ring)");
  });
});
