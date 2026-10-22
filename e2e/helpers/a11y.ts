/**
 * Accessibility assertions (WCAG 2.2 AA) for E2E tests.
 *
 * expectAccessible(page): waits until loading states are gone, then runs axe
 * with the WCAG A/AA tags and fails with one line per problem:
 * "rule · impact · targets". Best-practice findings are reported (as a test
 * annotation and attachment) but do not fail the test.
 *
 * Documented exclusions (both are false positives, not hidden problems):
 * - color-contrast on the input-otp <input>: its text is transparent on
 *   purpose; the visible PIN slots next to it are checked normally.
 * - ECharts <canvas> elements: they are aria-hidden pictures; every chart
 *   has a text/table alternative (AccessibleChart) that is checked.
 */
import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const WCAG_TAGS = [
  "wcag2a",
  "wcag2aa",
  "wcag21a",
  "wcag21aa",
  "wcag22aa",
] as const;

type AxeViolation = Awaited<
  ReturnType<AxeBuilder["analyze"]>
>["violations"][number];

export type AccessibleOptions = {
  /** Only scan this part of the page. */
  include?: string;
  /** Extra regions to leave out (document why at the call site). */
  exclude?: string[];
  /** Rules to switch off (document why at the call site). */
  disableRules?: string[];
};

/** Wait until skeletons, spinners and busy regions are gone. */
export async function waitForSettled(page: Page, timeout = 15_000) {
  await page.waitForLoadState("domcontentloaded");
  await expect(page.locator('[aria-busy="true"]:visible')).toHaveCount(0, {
    timeout,
  });
  await expect(page.locator('[data-slot="skeleton"]:visible')).toHaveCount(0, {
    timeout,
  });
  await expect(
    page.getByRole("status").filter({ hasText: /^Laden…$/ }),
  ).toHaveCount(0, { timeout });
  // Let entrance transitions finish (they would skew contrast checks).
  await page.waitForTimeout(150);
}

function isKnownFalsePositive(v: AxeViolation, target: string): boolean {
  if (v.id === "color-contrast" && /input-otp|data-input-otp/.test(target))
    return true;
  if (/canvas/.test(target) && /echarts|chart/i.test(target)) return true;
  return false;
}

function report(violations: AxeViolation[]): string[] {
  const lines: string[] = [];
  for (const v of violations) {
    const targets = v.nodes
      .map((n) => n.target.join(" "))
      .filter((t) => !isKnownFalsePositive(v, t));
    if (targets.length === 0) continue;
    lines.push(
      `${v.id} · ${v.impact ?? "?"} · ${targets.slice(0, 5).join(", ")}${targets.length > 5 ? ` (+${targets.length - 5})` : ""} — ${v.help}`,
    );
  }
  return lines;
}

function builder(page: Page, opts: AccessibleOptions) {
  let axe = new AxeBuilder({ page });
  if (opts.include) axe = axe.include(opts.include);
  for (const selector of opts.exclude ?? []) axe = axe.exclude(selector);
  if (opts.disableRules?.length) axe = axe.disableRules(opts.disableRules);
  return axe;
}

export async function expectAccessible(
  page: Page,
  opts: AccessibleOptions = {},
) {
  await waitForSettled(page);
  const wcag = await builder(page, opts)
    .withTags([...WCAG_TAGS])
    .analyze();
  await test.info().attach("axe-wcag.json", {
    body: JSON.stringify(wcag.violations, null, 2),
    contentType: "application/json",
  });
  const problems = report(wcag.violations);
  expect(problems, `WCAG problems on ${page.url()}`).toEqual([]);

  const best = await builder(page, opts).withTags(["best-practice"]).analyze();
  const advice = report(best.violations);
  if (advice.length > 0) {
    test.info().annotations.push({
      type: "a11y best-practice",
      description: `${page.url()}\n${advice.join("\n")}`,
    });
    await test.info().attach("axe-best-practice.json", {
      body: JSON.stringify(best.violations, null, 2),
      contentType: "application/json",
    });
  }
}

/**
 * Structure checks axe doesn't make: one visible h1 and one visible main,
 * a page title ending in " · Pensuma", and unique ids for everything that
 * label/aria references point at (hidden route trees included).
 */
export async function assertPageBasics(page: Page) {
  await expect(page.locator("h1:visible")).toHaveCount(1);
  await expect(page.locator("main:visible")).toHaveCount(1);
  await expect(page).toHaveTitle(/ · Pensuma$/);
  const duplicates = await page.evaluate(() => {
    const ids = new Set<string>();
    for (const el of document.querySelectorAll("label[for]")) {
      const id = el.getAttribute("for");
      if (id) ids.add(id);
    }
    for (const attr of [
      "aria-labelledby",
      "aria-describedby",
      "aria-controls",
      "aria-errormessage",
    ]) {
      for (const el of document.querySelectorAll(`[${attr}]`)) {
        for (const id of (el.getAttribute(attr) ?? "").split(/\s+/)) {
          if (id) ids.add(id);
        }
      }
    }
    return [...ids].filter(
      (id) => document.querySelectorAll(`[id="${CSS.escape(id)}"]`).length > 1,
    );
  });
  expect(duplicates, "duplicate ids referenced by labels/aria").toEqual([]);
}
