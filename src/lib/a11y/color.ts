/**
 * Minimal colour maths for the palette contrast guard (palette.test.ts):
 * parse the CSS colours used in globals.css, alpha-composite them like a
 * browser does (in gamma-encoded sRGB) and compute WCAG contrast ratios.
 */

/** Gamma-encoded sRGB channels in 0..1. */
export type Rgb = readonly [number, number, number];

export interface Rgba {
  rgb: Rgb;
  alpha: number;
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function encode(linear: number): number {
  const x = clamp01(linear);
  return x <= 0.0031308 ? 12.92 * x : 1.055 * x ** (1 / 2.4) - 0.055;
}

function decode(channel: number): number {
  return channel <= 0.04045
    ? channel / 12.92
    : ((channel + 0.055) / 1.055) ** 2.4;
}

/** OKLCH → gamma-encoded sRGB, clipped to the sRGB gamut. */
export function oklchToRgb(l: number, c: number, hDeg: number): Rgb {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = l + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = l - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = l - 0.0894841775 * a - 1.291485548 * b;
  const lc = l_ ** 3;
  const mc = m_ ** 3;
  const sc = s_ ** 3;
  const r = 4.0767416621 * lc - 3.3077115913 * mc + 0.2309699292 * sc;
  const g = -1.2684380046 * lc + 2.6097574011 * mc - 0.3413193965 * sc;
  const bl = -0.0041960863 * lc - 0.7034186147 * mc + 1.707614701 * sc;
  return [encode(r), encode(g), encode(bl)];
}

function hslToRgb(hDeg: number, s: number, l: number): Rgb {
  const k = (n: number) => (n + hDeg / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) =>
    l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)];
}

function parseAlpha(value: string | undefined): number {
  if (!value) return 1;
  const v = value.trim();
  return clamp01(v.endsWith("%") ? Number.parseFloat(v) / 100 : Number(v));
}

function parseNumber(value: string, percentScale = 1): number {
  const v = value.trim();
  return v.endsWith("%")
    ? (Number.parseFloat(v) / 100) * percentScale
    : Number.parseFloat(v);
}

/** Parse oklch(), #hex, hsl() and a few keywords. Throws on anything else. */
export function parseColor(input: string): Rgba {
  const value = input.trim().toLowerCase();

  const oklch =
    /^oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)(?:deg)?\s*(?:\/\s*([\d.]+%?))?\s*\)$/.exec(
      value,
    );
  if (oklch) {
    const [, l = "0", c = "0", h = "0", alpha] = oklch;
    return {
      rgb: oklchToRgb(parseNumber(l), parseNumber(c, 0.4), Number(h)),
      alpha: parseAlpha(alpha),
    };
  }

  const hex = /^#([0-9a-f]{3,8})$/.exec(value);
  if (hex?.[1] && [3, 4, 6, 8].includes(hex[1].length)) {
    let digits = hex[1];
    if (digits.length <= 4) {
      digits = [...digits].map((d) => d + d).join("");
    }
    const channel = (i: number) =>
      Number.parseInt(digits.slice(i, i + 2), 16) / 255;
    return {
      rgb: [channel(0), channel(2), channel(4)],
      alpha: digits.length === 8 ? channel(6) : 1,
    };
  }

  const hsl =
    /^hsla?\(\s*([\d.]+)(?:deg)?[\s,]+([\d.]+)%[\s,]+([\d.]+)%\s*(?:[,/]\s*([\d.]+%?))?\s*\)$/.exec(
      value,
    );
  if (hsl) {
    const [, h = "0", s = "0", l = "0", alpha] = hsl;
    return {
      rgb: hslToRgb(Number(h), Number(s) / 100, Number(l) / 100),
      alpha: parseAlpha(alpha),
    };
  }

  if (value === "white") return { rgb: [1, 1, 1], alpha: 1 };
  if (value === "black") return { rgb: [0, 0, 0], alpha: 1 };
  if (value === "transparent") return { rgb: [0, 0, 0], alpha: 0 };
  throw new Error(`Onbekende kleur: ${input}`);
}

/** Paint `top` (with alpha) over an opaque `bottom`. */
export function composite(top: Rgba, bottom: Rgb): Rgb {
  const a = top.alpha;
  return [
    a * top.rgb[0] + (1 - a) * bottom[0],
    a * top.rgb[1] + (1 - a) * bottom[1],
    a * top.rgb[2] + (1 - a) * bottom[2],
  ];
}

/** WCAG relative luminance. */
export function relativeLuminance(rgb: Rgb): number {
  return (
    0.2126 * decode(rgb[0]) + 0.7152 * decode(rgb[1]) + 0.0722 * decode(rgb[2])
  );
}

/** WCAG contrast ratio (1..21). */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

export function toHex(rgb: Rgb): string {
  return `#${rgb
    .map((c) =>
      Math.round(clamp01(c) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

export type ThemeTokens = Record<string, string>;

function blocks(css: string, selector: RegExp): string[] {
  const out: string[] = [];
  const re = new RegExp(
    `(?:^|\\n)\\s*${selector.source}\\s*\\{([^}]*)\\}`,
    "g",
  );
  for (const match of css.matchAll(re)) out.push(match[1] ?? "");
  return out;
}

function declarations(block: string): ThemeTokens {
  const tokens: ThemeTokens = {};
  const withoutComments = block.replace(/\/\*[\s\S]*?\*\//g, "");
  for (const match of withoutComments.matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) {
    const [, name, value] = match;
    if (name && value) tokens[name] = value.trim();
  }
  return tokens;
}

/**
 * The colour tokens of both themes: every plain `:root { … }` block (light)
 * and `.dark { … }` merged over it (dark). Values that aren't plain colours
 * (var(), calc()) are kept as text; parseColor rejects them.
 */
export function readThemeTokens(css: string): {
  light: ThemeTokens;
  dark: ThemeTokens;
} {
  const light: ThemeTokens = {};
  for (const block of blocks(css, /:root/))
    Object.assign(light, declarations(block));
  const dark: ThemeTokens = { ...light };
  for (const block of blocks(css, /\.dark/))
    Object.assign(dark, declarations(block));
  return { light, dark };
}
