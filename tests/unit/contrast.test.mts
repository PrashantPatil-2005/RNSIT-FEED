// Colour contrast guard for src/styles/tokens.css (node --test).
// Parses the token blocks, resolves var() references, converts OKLCH → sRGB, and checks WCAG 2
// contrast ratios for the pairs components actually use, in both themes.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

const css = readFileSync(new URL("../../src/styles/tokens.css", import.meta.url), "utf8").replace(
  /\/\*[\s\S]*?\*\//g,
  "",
);

/** Declarations inside the first block whose selector text matches `selector` exactly. */
function block(selector: string): Map<string, string> {
  const start = css.indexOf(`${selector} {`);
  assert.notEqual(start, -1, `selector not found: ${selector}`);
  const open = css.indexOf("{", start);
  const close = css.indexOf("}", open);
  const out = new Map<string, string>();
  for (const m of css.slice(open + 1, close).matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) {
    out.set(m[1], m[2].trim().replace(/\s+/g, " "));
  }
  return out;
}

const root = block(":root");
const darkMedia = block(':root:not([data-theme="light"])');
const darkForced = block(':root[data-theme="dark"]');
const light = root;
const dark = new Map([...root, ...darkForced]);

type RGB = [number, number, number];

function resolve(tokens: Map<string, string>, name: string, depth = 0): string {
  const v = tokens.get(name);
  assert.ok(v, `token missing: ${name}`);
  assert.ok(depth < 10, `var() cycle at ${name}`);
  const ref = /^var\((--[\w-]+)\)$/.exec(v);
  return ref ? resolve(tokens, ref[1], depth + 1) : v;
}

/** OKLCH → linear sRGB (Björn Ottosson's matrices). Returns linear channels, unclamped. */
function oklchToLinear(l: number, c: number, hDeg: number): RGB {
  const h = (hDeg * Math.PI) / 180;
  const a = c * Math.cos(h);
  const b = c * Math.sin(h);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_,
    -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_,
    -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_,
  ];
}

function parse(value: string): RGB {
  const m = /^oklch\(([\d.]+) ([\d.]+) ([\d.]+)\)$/.exec(value);
  assert.ok(m, `expected plain oklch(L C H), got: ${value}`);
  return oklchToLinear(Number(m[1]), Number(m[2]), Number(m[3]));
}

function luminance([r, g, b]: RGB): number {
  const clamp = (x: number) => Math.min(1, Math.max(0, x));
  return 0.2126 * clamp(r) + 0.7152 * clamp(g) + 0.0722 * clamp(b);
}

function ratio(tokens: Map<string, string>, fg: string, bg: string): number {
  const a = luminance(parse(resolve(tokens, fg)));
  const b = luminance(parse(resolve(tokens, bg)));
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

const SURFACES = ["--color-bg", "--color-surface", "--color-surface-raised"];
const PAIRS: Array<[fg: string, bgs: string[], min: number]> = [
  ["--color-fg", SURFACES, 7],
  ["--color-fg-muted", SURFACES, 4.5],
  ["--color-fg-subtle", ["--color-bg", "--color-surface-raised"], 4.5],
  ["--color-accent", [...SURFACES, "--color-accent-soft"], 4.5],
  ["--color-accent-fg", ["--color-accent"], 4.5],
  ["--color-heading", SURFACES, 7],
  ["--color-heading-minor", SURFACES, 4.5],
  ["--color-highlight", SURFACES, 4.5],
  ["--color-round-oa", SURFACES, 4.5],
  ["--color-round-technical", SURFACES, 4.5],
  ["--color-round-hr", SURFACES, 4.5],
  ["--color-round-gd", SURFACES, 4.5],
  ["--color-round-managerial", SURFACES, 4.5],
  ["--color-on-inverse", ["--color-inverse"], 7],
  ["--color-bg", ["--color-danger"], 4.5], // .btn--danger label
  ["--color-border-strong", ["--color-bg", "--color-surface-raised"], 3],
  ["--color-focus", ["--color-bg"], 3],
  ["--color-success", ["--color-bg", "--color-surface-raised", "--color-success-soft"], 4.5],
  ["--color-warn", ["--color-bg", "--color-surface-raised", "--color-warn-soft"], 4.5],
  ["--color-danger", ["--color-bg", "--color-surface-raised", "--color-danger-soft"], 4.5],
  ["--color-info", ["--color-bg", "--color-surface-raised", "--color-info-soft"], 4.5],
];

for (const [themeName, tokens] of [
  ["light", light],
  ["dark", dark],
] as const) {
  test(`${themeName}: contrast pairs meet WCAG targets`, () => {
    const failures: string[] = [];
    for (const [fg, bgs, min] of PAIRS) {
      for (const bg of bgs) {
        const r = ratio(tokens, fg, bg);
        if (r < min) failures.push(`${fg} on ${bg}: ${r.toFixed(2)} < ${min}`);
      }
    }
    assert.deepEqual(failures, []);
  });

  test(`${themeName}: semantic colours are inside the sRGB gamut`, () => {
    const out: string[] = [];
    for (const name of tokens.keys()) {
      if (!name.startsWith("--color-")) continue;
      const v = resolve(tokens, name);
      if (!v.startsWith("oklch(")) continue;
      const rgb = parse(v);
      if (rgb.some((ch) => ch < -0.002 || ch > 1.002)) out.push(`${name}: ${v}`);
    }
    assert.deepEqual(out, []);
  });
}

test("dark theme is identical in the media query and the forced attribute block", () => {
  assert.deepEqual([...darkMedia].sort(), [...darkForced].sort());
});

test("light and dark define the same semantic colour tokens", () => {
  const lightNames = [...light.keys()].filter((k) => k.startsWith("--color-")).sort();
  const darkNames = [...darkForced.keys()].filter((k) => k.startsWith("--color-")).sort();
  assert.deepEqual(darkNames, lightNames);
});
