import { describe, expect, test } from "bun:test";
import {
  comparePair,
  compareSubmissions,
  SOLUTION_ID,
  toRanges,
} from "./compare";
import { fingerprint, fnv1a32, normalizeTokens, winnow } from "./fingerprint";

const original = `# Gemiddelde van de cijfers
cijfers = []
aantal = int(input("Hoeveel cijfers? "))
for i in range(aantal):
    cijfer = float(input("Cijfer: "))
    cijfers.append(cijfer)
totaal = sum(cijfers)
gemiddelde = totaal / aantal
if gemiddelde >= 5.5:
    print("Voldoende:", round(gemiddelde, 1))
else:
    print("Onvoldoende:", round(gemiddelde, 1))
`;

// Same program, other names, other strings, other comments.
const renamed = `lijst = []
n = int(input("Aantal? "))
for x in range(n):
    c = float(input("Geef een cijfer: "))
    lijst.append(c)
som = sum(lijst)
gem = som / n
if gem >= 6.0:
    print("Goed:", round(gem, 2))
else:
    print("Slecht:", round(gem, 2))
`;

// Two independent statements swapped (the two input lines at the top).
const swapped = `aantal = int(input("Hoeveel cijfers? "))
cijfers = []
for i in range(aantal):
    cijfer = float(input("Cijfer: "))
    cijfers.append(cijfer)
totaal = sum(cijfers)
gemiddelde = totaal / aantal
if gemiddelde >= 5.5:
    print("Voldoende:", round(gemiddelde, 1))
else:
    print("Onvoldoende:", round(gemiddelde, 1))
`;

const unrelated = `def is_priem(getal):
    if getal < 2:
        return False
    deler = 2
    while deler * deler <= getal:
        if getal % deler == 0:
            return False
        deler += 1
    return True

woord = input()
print(woord[::-1].upper())
print(len(woord))
`;

describe("fingerprint", () => {
  test("normalises names, numbers and strings, drops comments", () => {
    const values = normalizeTokens('x = 3 # tel\nprint("hoi", len(x))\n').map(
      (t) => t.value,
    );
    expect(values).toEqual([
      "V",
      "=",
      "N",
      ";",
      "print",
      "(",
      "S",
      ",",
      "len",
      "(",
      "V",
      ")",
      ")",
      ";",
    ]);
  });

  test("FNV-1a 32 bit reference values", () => {
    expect(fnv1a32("")).toBe(0x811c9dc5);
    expect(fnv1a32("a")).toBe(0xe40c292c);
    expect(fnv1a32("foobar")).toBe(0xbf9cf968);
  });

  test("winnowing picks the rightmost minimum per window", () => {
    // Windows of 4: [5,3,3,9] → index 2 (rightmost 3), [3,3,9,1] and
    // [3,9,1,7] → index 4 (recorded once).
    expect(winnow([5, 3, 3, 9, 1, 7], 4)).toEqual([2, 4]);
    expect(winnow([2, 1], 4)).toEqual([1]);
    expect(winnow([], 4)).toEqual([]);
  });

  test("renaming does not change the fingerprint", () => {
    const a = fingerprint(original);
    const b = fingerprint(renamed);
    expect(a.structure).toBe(b.structure);
    expect([...a.hashes].sort()).toEqual([...b.hashes].sort());
  });
});

describe("compareSubmissions", () => {
  test("renamed copy: identical structure, score 1", () => {
    const res = compareSubmissions([
      { id: "a", code: original },
      { id: "b", code: renamed },
    ]);
    expect(res.analyzed).toBe(2);
    expect(res.pairs).toHaveLength(1);
    expect(res.pairs[0]).toMatchObject({
      a: "a",
      b: "b",
      score: 1,
      jaccard: 1,
      identicalStructure: true,
      exact: false,
    });
    expect(res.pairs[0].linesA.length).toBeGreaterThan(5);
  });

  test("an exact copy is marked exact", () => {
    const res = compareSubmissions([
      { id: "a", code: original },
      { id: "b", code: `${original}\n\n` },
    ]);
    expect(res.pairs[0]).toMatchObject({ exact: true, score: 1 });
  });

  test("swapping two independent lines stays above 0.6", () => {
    const res = compareSubmissions(
      [
        { id: "a", code: original },
        { id: "b", code: swapped },
      ],
      { threshold: 0 },
    );
    expect(res.pairs[0].score).toBeGreaterThan(0.6);
    expect(res.pairs[0].identicalStructure).toBe(false);
  });

  test("unrelated solutions score below 0.3", () => {
    const res = compareSubmissions(
      [
        { id: "a", code: original },
        { id: "b", code: unrelated },
      ],
      { threshold: 0 },
    );
    const score = res.pairs[0]?.score ?? 0;
    expect(score).toBeLessThan(0.3);
    // With the default threshold the pair is not reported at all.
    expect(
      compareSubmissions([
        { id: "a", code: original },
        { id: "b", code: unrelated },
      ]).pairs,
    ).toHaveLength(0);
  });

  test("starter code fingerprints are subtracted", () => {
    // Both students only kept the (long) starter code and added one line.
    const starter = original;
    const res = compareSubmissions(
      [
        { id: "a", code: `${starter}print("klaar")\n` },
        { id: "b", code: `${starter}print(totaal)\n` },
      ],
      { starterCode: starter, threshold: 0 },
    );
    for (const pair of res.pairs) expect(pair.score).toBeLessThan(1);
    // Without subtracting, the shared starter makes them look identical.
    const raw = compareSubmissions(
      [
        { id: "a", code: `${starter}print("klaar")\n` },
        { id: "b", code: `${starter}print(totaal)\n` },
      ],
      { threshold: 0 },
    );
    expect(raw.pairs[0].score).toBeGreaterThan(0.9);
  });

  test("fingerprints shared by more than half of 6+ answers are ignored", () => {
    // Six students share the same averaging program; two of them also copied
    // a unique second part.
    const extra = unrelated;
    const subs = [
      { id: "s1", code: `${original}${extra}` },
      { id: "s2", code: `${renamed}${extra}` },
      { id: "s3", code: original },
      { id: "s4", code: renamed },
      { id: "s5", code: swapped },
      { id: "s6", code: original },
    ];
    const res = compareSubmissions(subs, { threshold: 0.9 });
    // The common part no longer counts: s3/s4/s5/s6 have (almost) nothing
    // left, the s1–s2 pair is still found through their shared extra part.
    const ids = res.pairs.map((p) => `${p.a}-${p.b}`);
    expect(ids).toContain("s1-s2");
    expect(ids).not.toContain("s3-s6");
  });

  test("short answers are skipped", () => {
    const res = compareSubmissions([
      { id: "a", code: "print(1)" },
      { id: "b", code: "print(1)" },
      { id: "c", code: original },
    ]);
    expect(res.skippedShort).toEqual(["a", "b"]);
    expect(res.analyzed).toBe(1);
    expect(res.pairs).toHaveLength(0);
  });

  test("the model solution takes part as pseudo-id 'solution'", () => {
    const res = compareSubmissions(
      [
        { id: "a", code: renamed },
        { id: "b", code: unrelated },
      ],
      { solution: original },
    );
    expect(res.analyzed).toBe(2);
    expect(res.pairs).toHaveLength(1);
    expect(res.pairs[0]).toMatchObject({ a: "a", b: SOLUTION_ID, score: 1 });
  });

  test("maxSubmissions limits the work", () => {
    const res = compareSubmissions(
      [
        { id: "a", code: original },
        { id: "b", code: renamed },
        { id: "c", code: swapped },
      ],
      { maxSubmissions: 2 },
    );
    expect(res.truncated).toBe(true);
    expect(res.analyzed).toBe(2);
  });

  test("30 students × 12 questions in well under 300 ms", () => {
    const variants = [original, renamed, swapped, unrelated];
    const perQuestion = Array.from({ length: 30 }, (_, i) => ({
      id: `s${i}`,
      code: `${variants[i % 4]}\nextra_${i} = ${i} * 2\nprint(extra_${i})\n`,
    }));
    const start = performance.now();
    for (let q = 0; q < 12; q++) {
      compareSubmissions(perQuestion, { solution: original, threshold: 0.5 });
    }
    expect(performance.now() - start).toBeLessThan(300);
  });
});

describe("comparePair", () => {
  test("matched lines for the side-by-side view", () => {
    const res = comparePair(original, swapped);
    expect(res.score).toBeGreaterThan(0.6);
    expect(res.linesA).toContain(9);
    expect(res.linesB).toContain(9);
  });

  test("starter code lines are never highlighted", () => {
    const starter = "getallen = [3, 8, 15, 22]\n";
    const a = `${starter}for g in getallen:\n    if g % 2 == 0:\n        print(g)\n`;
    const b = `${starter}for x in getallen:\n    if x % 2 == 0:\n        print(x)\n`;
    const res = comparePair(a, b, { starterCode: starter });
    expect(res.linesA).not.toContain(1);
    expect(res.linesA).toContain(2);
    expect(res.linesB).toContain(4);
  });

  test("nothing in common", () => {
    const res = comparePair("print(1)", unrelated);
    expect(res.score).toBe(0);
    expect(res.linesA).toEqual([]);
  });
});

describe("toRanges", () => {
  test("collapses consecutive lines", () => {
    expect(toRanges([1, 2, 3, 7, 9, 10])).toEqual([
      [1, 3],
      [7, 7],
      [9, 10],
    ]);
    expect(toRanges([])).toEqual([]);
  });
});
