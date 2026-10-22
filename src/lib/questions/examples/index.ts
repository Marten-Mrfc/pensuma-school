/**
 * Ready-made Dutch example tests ("Voorbeeldtoetsen"). Teachers add one as a
 * draft test (bank.importExample) and adapt it. Pure data, also checked by
 * scripts/check-examples.ts (every model solution must pass the real
 * grader).
 */
import {
  type PortableTest,
  portableTestSchema,
} from "@/lib/questions/validate";
import { basisExample } from "./basis";
import { functiesExample } from "./functies";
import { lussenLijstenExample } from "./lussen-lijsten";

export type ExampleTestId = "basis" | "lussen-lijsten" | "functies";

export type ExampleTest = {
  id: ExampleTestId;
  /** One sentence for the card in the dialog. */
  summary: string;
  /** For a short label such as "Klas 3–4". */
  level: string;
  test: PortableTest;
};

const SOURCES = [
  {
    id: "basis",
    summary:
      "Tekst printen, invoer vragen met input() en rekenen met getallen. Een goede eerste toets.",
    level: "Beginners",
    test: basisExample,
  },
  {
    id: "lussen-lijsten",
    summary:
      "for- en while-lussen, range() en lijsten: aftellen, tafels en zelf het grootste getal zoeken.",
    level: "Na de basis",
    test: lussenLijstenExample,
  },
  {
    id: "functies",
    summary:
      "Eigen functies met parameters en return, nagekeken op wat ze teruggeven.",
    level: "Gevorderd",
    test: functiesExample,
  },
] as const;

/** Every example, parsed (defaults filled in). */
export const EXAMPLE_TESTS: readonly ExampleTest[] = SOURCES.map((s) => ({
  id: s.id,
  summary: s.summary,
  level: s.level,
  test: portableTestSchema.parse(s.test),
}));

export const EXAMPLE_TEST_IDS = EXAMPLE_TESTS.map((e) => e.id) as [
  ExampleTestId,
  ...ExampleTestId[],
];

export function getExampleTest(id: string): ExampleTest | undefined {
  return EXAMPLE_TESTS.find((e) => e.id === id);
}
