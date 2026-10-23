/**
 * Teacher-facing explanation of each output comparison mode, with examples.
 * Pure data next to compare.ts: match-mode-help.test.ts runs every example
 * through compareOutput, so this text and the grader can't drift apart.
 */
import type { OutputMatchMode } from "@/lib/questions/schema";

export type MatchModeExample = {
  expected: string;
  /** Outputs that pass. */
  good: string[];
  /** Outputs that fail. */
  bad: string[];
};

export type MatchModeHelp = {
  summary: string;
  examples: MatchModeExample[];
};

/** Dutch explanation + examples per comparison mode (mirrors src/lib/grading/compare.ts). */
export const MATCH_MODE_HELP: Record<OutputMatchMode, MatchModeHelp> = {
  flexible: {
    summary:
      "Hoofdletters, spaties en leestekens tellen niet mee; getallen worden op waarde vergeleken (108.50 = 108.5). Elke verwachte regel moet in volgorde in de uitvoer staan. Een label of zin eromheen mag, maar ‘niet’ of ‘geen’ bij het antwoord, het antwoord van een andere test op dezelfde regel of een extra getal ernaast maakt het fout. Extra regels mogen alleen als het een paar kopjes of vragen zijn (eindigend op : of ?).",
    examples: [
      {
        expected: "Hallo Mark",
        good: ["hallo mark!", "Antwoord: Hallo, Mark"],
        bad: ["Hallo", "Hoi Mark"],
      },
      {
        expected: "Geslaagd",
        good: ["Je bent geslaagd!"],
        bad: ["Niet geslaagd", "Geslaagd / niet geslaagd"],
      },
      {
        expected: "8",
        good: ["3 + 5 = 8", "De som is 8"],
        bad: ["7 8 9"],
      },
    ],
  },
  exact: {
    summary:
      "Elke regel moet precies gelijk zijn. Alleen spaties aan het eind van een regel en lege regels aan het eind tellen niet mee.",
    examples: [
      {
        expected: "8\n22",
        good: ["8\n22"],
        bad: ["8 22", "Even: 8\n22"],
      },
    ],
  },
  contains: {
    summary:
      "Elke verwachte regel moet ergens in de uitvoer staan (als hele woorden of getallen), in willekeurige volgorde. Let op: alles eromheen telt niet, dus ook ‘Je hebt niet gewonnen’ bevat ‘gewonnen’.",
    examples: [
      {
        expected: "gewonnen",
        good: ["Je hebt gewonnen!", "Score: 10\nGewonnen"],
        bad: ["Je hebt verloren"],
      },
    ],
  },
  numbers: {
    summary:
      "Alleen de getallen tellen, met de ingestelde tolerantie. De verwachte getallen moeten in dezelfde volgorde in de uitvoer staan; andere getallen ertussen (zoals de ingevoerde waarde) mogen. De tekst eromheen maakt niet uit en ook 10,5 (komma) wordt begrepen. Moeten extra getallen fout zijn? Kies dan ‘Flexibel’ of ‘Exact’.",
    examples: [
      {
        expected: "10",
        good: ["De oppervlakte is 10.0", "Oppervlakte: 10,001", "4 x 2.5 = 10"],
        bad: ["Oppervlakte: 12"],
      },
      {
        expected: "5\n10",
        good: ["5 en 10"],
        bad: ["10 5"],
      },
    ],
  },
  regex: {
    summary:
      "De verwachte uitvoer is een reguliere expressie (JavaScript-notatie) die ergens in de uitvoer moet passen. Voor gevorderden. Een patroon dat te lang rekent, wordt gestopt en telt als fout.",
    examples: [
      {
        expected: "^Hallo \\w+$",
        good: ["Hallo Mark"],
        bad: ["Hoi Mark"],
      },
    ],
  },
};
