import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  composite,
  contrastRatio,
  parseColor,
  type Rgb,
  readThemeTokens,
  type ThemeTokens,
  toHex,
} from "./color";

/**
 * Palette guard (WCAG 1.4.3 text 4.5:1, 1.4.11 non-text 3:1): checks the
 * colour tokens in src/app/globals.css for both themes. Values were first
 * verified with scratchpad/a11y-tools/contrast.py; this keeps them honest.
 */

const GLOBALS_CSS = join(import.meta.dir, "../../app/globals.css");

/** "token" or "token/alpha%" (Tailwind `bg-success/10`). */
type Spec = string;

interface Pair {
  label: string;
  fg: Spec;
  /** Background layers, bottom to top. */
  bg: Spec[];
  min: number;
}

const TEXT = 4.5;
const NON_TEXT = 3;

function codeTokens(tokens: ThemeTokens): string[] {
  const backgrounds = new Set([
    "code-bg",
    "code-active-line",
    "code-selection",
  ]);
  return Object.keys(tokens).filter(
    (name) => name.startsWith("code-") && !backgrounds.has(name),
  );
}

function pairsFor(tokens: ThemeTokens): Pair[] {
  const pairs: Pair[] = [
    {
      label: "foreground on background",
      fg: "foreground",
      bg: ["background"],
      min: TEXT,
    },
    { label: "foreground on card", fg: "foreground", bg: ["card"], min: TEXT },
  ];
  for (const surface of [
    "background",
    "card",
    "muted",
    "secondary",
    "sidebar",
    "accent",
  ]) {
    pairs.push({
      label: `muted-foreground on ${surface}`,
      fg: "muted-foreground",
      bg: [surface],
      min: TEXT,
    });
  }
  pairs.push({
    label: "primary-foreground on primary",
    fg: "primary-foreground",
    bg: ["primary"],
    min: TEXT,
  });
  for (const fg of ["primary", "destructive"]) {
    for (const surface of ["background", "card"]) {
      pairs.push({
        label: `${fg} text on ${surface}`,
        fg,
        bg: [surface],
        min: TEXT,
      });
    }
  }
  for (const [ink, tint] of [
    ["success-ink", "success/10"],
    ["warning-ink", "warning/10"],
    ["warning-ink", "warning/12"],
    ["info-ink", "info/10"],
    ["destructive-ink", "destructive/10"],
  ] as const) {
    pairs.push({
      label: `${ink} on ${tint} over card`,
      fg: ink,
      bg: ["card", tint],
      min: TEXT,
    });
  }
  for (const color of [
    "primary",
    "secondary",
    "accent",
    "destructive",
    "success",
    "warning",
    "info",
    "card",
    "popover",
    "sidebar-primary",
    "sidebar-accent",
  ]) {
    pairs.push({
      label: `${color}-foreground on ${color}`,
      fg: `${color}-foreground`,
      bg: [color],
      min: TEXT,
    });
  }
  pairs.push({
    label: "sidebar-foreground/70 on sidebar (group labels)",
    fg: "sidebar-foreground/70",
    bg: ["sidebar"],
    min: TEXT,
  });
  for (const fg of ["input", "ring"]) {
    for (const surface of ["card", "background"]) {
      pairs.push({
        label: `${fg} on ${surface}`,
        fg,
        bg: [surface],
        min: NON_TEXT,
      });
    }
  }
  for (const token of codeTokens(tokens)) {
    pairs.push({
      label: `${token} on code-bg`,
      fg: token,
      bg: ["code-bg"],
      min: TEXT,
    });
  }
  for (let i = 1; i <= 5; i++) {
    pairs.push({
      label: `chart-${i} on card`,
      fg: `chart-${i}`,
      bg: ["card"],
      min: NON_TEXT,
    });
  }
  return pairs;
}

function resolve(tokens: ThemeTokens, spec: Spec) {
  const [name = "", alphaPct] = spec.split("/");
  const value = tokens[name];
  if (!value) throw new Error(`Token --${name} ontbreekt in globals.css`);
  const color = parseColor(value);
  return alphaPct === undefined
    ? color
    : { ...color, alpha: color.alpha * (Number(alphaPct) / 100) };
}

interface Failure {
  theme: string;
  message: string;
}

function checkTheme(theme: "light" | "dark", tokens: ThemeTokens): Failure[] {
  // What sits below a translucent first layer: the page (white / black).
  const page: Rgb = theme === "light" ? [1, 1, 1] : [0, 0, 0];
  const failures: Failure[] = [];
  for (const pair of pairsFor(tokens)) {
    let bg = page;
    for (const layer of pair.bg) bg = composite(resolve(tokens, layer), bg);
    const fg = composite(resolve(tokens, pair.fg), bg);
    const ratio = contrastRatio(fg, bg);
    if (ratio + 1e-9 < pair.min) {
      failures.push({
        theme,
        message: `${theme}: ${pair.label} is ${ratio.toFixed(2)}:1 (nodig ${pair.min}:1) — ${toHex(fg)} op ${toHex(bg)}`,
      });
    }
  }
  return failures;
}

function checkPalette(css: string): Failure[] {
  const { light, dark } = readThemeTokens(css);
  return [...checkTheme("light", light), ...checkTheme("dark", dark)];
}

const css = readFileSync(GLOBALS_CSS, "utf8");

describe("palette contrast (globals.css)", () => {
  const { light, dark } = readThemeTokens(css);

  test("reads both themes", () => {
    expect(light.background).toBeDefined();
    expect(dark.background).not.toBe(light.background);
    expect(codeTokens(light).length).toBeGreaterThanOrEqual(10);
  });

  for (const [theme, tokens] of [
    ["light", light],
    ["dark", dark],
  ] as const) {
    test(`${theme} theme meets WCAG AA`, () => {
      const failures = checkTheme(theme, tokens).map((f) => f.message);
      expect(failures).toEqual([]);
    });
  }
});

describe("palette guard catches regressions", () => {
  test("fails when --input is reverted to the old light border colour", () => {
    const reverted = css.replace(
      /(:root\s*\{[\s\S]*?--input:\s*)[^;]+;/,
      "$1oklch(0.88 0.014 135);",
    );
    expect(reverted).not.toBe(css);
    const failures = checkPalette(reverted).map((f) => f.message);
    expect(failures.some((m) => m.startsWith("light: input on card"))).toBe(
      true,
    );
    expect(failures.find((m) => m.startsWith("light: input on card"))).toMatch(
      /1\.\d\d:1 \(nodig 3:1\) — #[0-9a-f]{6} op #ffffff/,
    );
  });

  test("fails when a code token is too light", () => {
    const broken = css.replace(
      /(:root\s*\{[\s\S]*?--code-comment:\s*)[^;]+;/,
      "$1oklch(0.75 0.02 140);",
    );
    expect(
      checkPalette(broken).some((f) =>
        f.message.startsWith("light: code-comment on code-bg"),
      ),
    ).toBe(true);
  });
});

describe("color helpers", () => {
  test("contrast of black on white is 21:1 and symmetric", () => {
    expect(contrastRatio([0, 0, 0], [1, 1, 1])).toBeCloseTo(21, 5);
    expect(contrastRatio([1, 1, 1], [0, 0, 0])).toBeCloseTo(21, 5);
  });

  test("parses hex, hsl and oklch", () => {
    expect(toHex(parseColor("#a07800").rgb)).toBe("#a07800");
    expect(toHex(parseColor("#fff").rgb)).toBe("#ffffff");
    expect(toHex(parseColor("hsl(0, 100%, 50%)").rgb)).toBe("#ff0000");
    expect(toHex(parseColor("oklch(1 0 0)").rgb)).toBe("#ffffff");
    expect(toHex(parseColor("oklch(0 0 0)").rgb)).toBe("#000000");
    expect(parseColor("oklch(1 0 0 / 12%)").alpha).toBeCloseTo(0.12, 5);
    expect(() => parseColor("var(--x)")).toThrow();
  });

  test("composites alpha over the surface", () => {
    const half = composite({ rgb: [0, 0, 0], alpha: 0.5 }, [1, 1, 1]);
    expect(half[0]).toBeCloseTo(0.5, 5);
  });
});

describe('"Extra contrast" preference (data-contrast="more")', () => {
  function overrides(selector: RegExp): ThemeTokens {
    const match = selector.exec(css);
    expect(match).not.toBeNull();
    const tokens: ThemeTokens = {};
    for (const m of (match?.[1] ?? "").matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
      if (m[1] && m[2]) tokens[m[1]] = m[2].trim();
    }
    return tokens;
  }

  const { light, dark } = readThemeTokens(css);
  const themes = {
    light: {
      ...light,
      ...overrides(/:root\[data-contrast="more"\]\s*\{([^}]*)\}/),
    },
    dark: {
      ...dark,
      ...overrides(/:root\.dark\[data-contrast="more"\]\s*\{([^}]*)\}/),
    },
  };

  for (const [theme, tokens] of Object.entries(themes)) {
    test(`${theme}: secondary text and code reach 7:1, boundaries 3:1`, () => {
      const page: Rgb = theme === "light" ? [1, 1, 1] : [0, 0, 0];
      const ratio = (fg: string, bg: string) => {
        const back = composite(resolve(tokens, bg), page);
        return contrastRatio(composite(resolve(tokens, fg), back), back);
      };
      for (const surface of [
        "background",
        "card",
        "muted",
        "secondary",
        "sidebar",
        "accent",
      ]) {
        expect(ratio("muted-foreground", surface)).toBeGreaterThanOrEqual(7);
      }
      for (const token of codeTokens(tokens)) {
        expect(ratio(token, "code-bg")).toBeGreaterThanOrEqual(7);
      }
      for (const token of ["border", "input", "ring"]) {
        expect(ratio(token, "card")).toBeGreaterThanOrEqual(3);
        expect(ratio(token, "background")).toBeGreaterThanOrEqual(3);
      }
    });
  }
});
