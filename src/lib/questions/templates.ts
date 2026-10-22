/**
 * Question presets for the test builder ("Vraag toevoegen").
 *
 * Every template produces a complete, valid question (title, prompt, points
 * and type-specific data) so a teacher starts from a working example instead
 * of an empty form. Pure module: used by the `question.create` procedure and
 * by the builder UI.
 */
import type {
  ChoiceOption,
  CodeCheck,
  CodeQuestionData,
  CodeTest,
  FunctionTest,
  IoTest,
  MultipleChoiceData,
  OpenQuestionData,
  QuestionDataByType,
  QuestionType,
} from "@/lib/questions/schema";
import {
  codeQuestionDataSchema,
  multipleChoiceDataSchema,
  openQuestionDataSchema,
} from "@/lib/questions/schema";

/* -------------------------------------------------------------------------- */
/*                                    Ids                                     */
/* -------------------------------------------------------------------------- */

const ID_ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/**
 * Short random id for tests, checks and options inside one question.
 * Uses `crypto.getRandomValues`, which (unlike `randomUUID`) also works on
 * plain-http school networks.
 */
export function createLocalId(prefix = ""): string {
  const bytes = new Uint8Array(8);
  globalThis.crypto.getRandomValues(bytes);
  let id = "";
  for (const b of bytes) id += ID_ALPHABET[b % ID_ALPHABET.length];
  return prefix ? `${prefix}_${id}` : id;
}

/* -------------------------------------------------------------------------- */
/*                              Building blocks                               */
/* -------------------------------------------------------------------------- */

/** A new output test with sensible defaults (flexible matching). */
export function newIoTest(overrides: Partial<IoTest> = {}): IoTest {
  return {
    id: createLocalId("t"),
    kind: "io",
    name: "",
    hidden: false,
    weight: 1,
    stdin: "",
    expectedOutput: "",
    match: "flexible",
    ignoreCase: true,
    tolerance: 0.01,
    ...overrides,
  };
}

/** A new function test (return value comparison). */
export function newFunctionTest(
  overrides: Partial<FunctionTest> = {},
): FunctionTest {
  return {
    id: createLocalId("t"),
    kind: "function",
    name: "",
    hidden: false,
    weight: 1,
    call: "functie()",
    expected: "None",
    tolerance: 1e-6,
    ...overrides,
  };
}

export function newCheck(overrides: Partial<CodeCheck> = {}): CodeCheck {
  return {
    id: createLocalId("c"),
    kind: "requires",
    construct: "for_loop",
    weight: 1,
    ...overrides,
  };
}

export function newOption(overrides: Partial<ChoiceOption> = {}): ChoiceOption {
  return { id: createLocalId("o"), text: "", correct: false, ...overrides };
}

/** Copy a test with a fresh id (used by "dupliceren"). */
export function cloneTest<T extends CodeTest>(test: T): T {
  return { ...test, id: createLocalId("t") };
}

/**
 * Give every test, check, hint, option and rubric item a fresh id. Used when
 * copying questions between tests so ids never collide with answers/results
 * of the original.
 */
export function refreshDataIds<T extends QuestionType>(
  type: T,
  data: QuestionDataByType[T],
): QuestionDataByType[T] {
  if (type === "code") {
    const d = data as CodeQuestionData;
    return {
      ...d,
      tests: d.tests.map((t) => ({ ...t, id: createLocalId("t") })),
      checks: d.checks.map((c) => ({ ...c, id: createLocalId("c") })),
      hints: (d.hints ?? []).map((h) => ({ ...h, id: createLocalId("h") })),
    } as QuestionDataByType[T];
  }
  if (type === "multiple_choice") {
    const d = data as MultipleChoiceData;
    return {
      ...d,
      options: d.options.map((o) => ({ ...o, id: createLocalId("o") })),
    } as QuestionDataByType[T];
  }
  const d = data as OpenQuestionData;
  return {
    ...d,
    rubricItems: (d.rubricItems ?? []).map((r) => ({
      ...r,
      id: createLocalId("r"),
    })),
  } as QuestionDataByType[T];
}

/* -------------------------------------------------------------------------- */
/*                                 Templates                                  */
/* -------------------------------------------------------------------------- */

export type QuestionTemplateId =
  | "code-empty"
  | "code-print"
  | "code-io"
  | "code-numbers"
  | "code-function"
  | "mc-single"
  | "mc-multiple"
  | "open";

/** What a template produces; the router adds testId/position. */
export type QuestionDraft<T extends QuestionType = QuestionType> = {
  type: T;
  title: string;
  prompt: string;
  points: number;
  data: QuestionDataByType[T];
};

/**
 * Lucide icon names (PascalCase, as exported by `lucide-react`). The UI maps
 * them to components, so this module stays free of React.
 */
export type QuestionTemplateIcon =
  | "SquareCode"
  | "Printer"
  | "Keyboard"
  | "Calculator"
  | "SquareFunction"
  | "CircleDot"
  | "ListChecks"
  | "MessageSquareText";

export type QuestionTemplate = {
  id: QuestionTemplateId;
  type: QuestionType;
  /** Dutch label in the "Vraag toevoegen" menu. */
  label: string;
  /** One-line Dutch explanation for teachers. */
  description: string;
  icon: QuestionTemplateIcon;
  /** Builds a fresh question (new ids every call). */
  build: () => QuestionDraft;
};

function code(
  title: string,
  prompt: string,
  points: number,
  data: Partial<CodeQuestionData>,
): QuestionDraft<"code"> {
  return {
    type: "code",
    title,
    prompt,
    points,
    data: codeQuestionDataSchema.parse(data),
  };
}

export const QUESTION_TEMPLATES: readonly QuestionTemplate[] = [
  {
    id: "code-empty",
    type: "code",
    label: "Lege programmeervraag",
    description: "Begin met een lege programmeervraag en stel alles zelf in.",
    icon: "SquareCode",
    build: () =>
      code("Programmeervraag", "", 1, {
        starterCode: "# Schrijf hieronder je code\n",
        solution: "",
        tests: [newIoTest({ name: "Test 1" })],
      }),
  },
  {
    id: "code-print",
    type: "code",
    label: "Print-opdracht",
    description:
      "De leerling print vaste tekst. Eén uitvoertest zonder invoer.",
    icon: "Printer",
    build: () =>
      code(
        "Print een zin",
        "Schrijf een programma dat de tekst **Ik leer Python!** print.",
        1,
        {
          starterCode: "# Schrijf hieronder je code\n",
          solution: 'print("Ik leer Python!")\n',
          tests: [
            newIoTest({ name: "Uitvoer", expectedOutput: "Ik leer Python!" }),
          ],
        },
      ),
  },
  {
    id: "code-io",
    type: "code",
    label: "Invoer & uitvoer",
    description:
      "De leerling leest invoer met input() en print iets terug. De vraagtekst in input() telt nooit mee.",
    icon: "Keyboard",
    build: () =>
      code(
        "Begroeting",
        [
          "Vraag de gebruiker om zijn of haar naam met `input()` en print daarna een begroeting.",
          "",
          "**Voorbeeld**: als de gebruiker `Mark` invoert, print je programma:",
          "",
          "```",
          "Hallo Mark",
          "```",
          "",
          'Je mag zelf weten wat je tussen de haakjes van `input()` zet, bijvoorbeeld `input("Wat is je naam? ")`.',
        ].join("\n"),
        2,
        {
          starterCode: "# Vraag de naam en print een begroeting\n",
          solution:
            'naam = input("Wat is je naam? ")\nprint("Hallo " + naam)\n',
          tests: [
            newIoTest({
              name: "Invoer: Mark",
              stdin: "Mark",
              expectedOutput: "Hallo Mark",
            }),
            newIoTest({
              name: "Invoer: Fatima",
              stdin: "Fatima",
              expectedOutput: "Hallo Fatima",
              hidden: true,
            }),
          ],
        },
      ),
  },
  {
    id: "code-numbers",
    type: "code",
    label: "Rekenen met getallen",
    description:
      "Alleen de getallen in de uitvoer tellen (met tolerantie), de tekst eromheen maakt niet uit.",
    icon: "Calculator",
    build: () =>
      code(
        "Oppervlakte van een rechthoek",
        [
          "Vraag de **lengte** en de **breedte** van een rechthoek (in meters) en print de oppervlakte.",
          "",
          "Voorbeeld: bij lengte `4` en breedte `2.5` print je programma bijvoorbeeld `De oppervlakte is 10.0 vierkante meter`.",
          "",
          "> Tip: `input()` geeft altijd tekst terug. Gebruik `float()` om er een getal van te maken.",
        ].join("\n"),
        2,
        {
          starterCode: "",
          solution:
            'lengte = float(input("Lengte: "))\nbreedte = float(input("Breedte: "))\nprint("De oppervlakte is", lengte * breedte, "vierkante meter")\n',
          tests: [
            newIoTest({
              name: "Lengte 4, breedte 2.5",
              stdin: "4\n2.5",
              expectedOutput: "10",
              match: "numbers",
            }),
            newIoTest({
              name: "Lengte 3, breedte 3",
              stdin: "3\n3",
              expectedOutput: "9",
              match: "numbers",
            }),
            newIoTest({
              name: "Kommagetallen",
              stdin: "1.5\n0.2",
              expectedOutput: "0.3",
              match: "numbers",
              hidden: true,
            }),
          ],
        },
      ),
  },
  {
    id: "code-function",
    type: "code",
    label: "Functie schrijven",
    description:
      "De leerling schrijft een functie; tests vergelijken de returnwaarde. Een def is verplicht.",
    icon: "SquareFunction",
    build: () =>
      code(
        "Gemiddelde",
        [
          "Schrijf een functie `gemiddelde(getallen)` die het **gemiddelde** van een lijst getallen teruggeeft (met `return`).",
          "",
          "```python",
          "gemiddelde([1, 2, 3])   # geeft 2.0",
          "gemiddelde([10])        # geeft 10.0",
          "```",
          "",
          "Je hoeft zelf niets te printen.",
        ].join("\n"),
        3,
        {
          starterCode:
            "def gemiddelde(getallen):\n    # jouw code hier\n    pass\n",
          solution:
            "def gemiddelde(getallen):\n    return sum(getallen) / len(getallen)\n",
          tests: [
            newFunctionTest({
              name: "Drie getallen",
              call: "gemiddelde([1, 2, 3])",
              expected: "2.0",
            }),
            newFunctionTest({
              name: "Eén getal",
              call: "gemiddelde([10])",
              expected: "10.0",
            }),
            newFunctionTest({
              name: "Negatieve getallen",
              call: "gemiddelde([-4, 4, 9])",
              expected: "3.0",
              hidden: true,
            }),
          ],
          checks: [
            newCheck({
              kind: "requires",
              construct: "function_def",
              value: "gemiddelde",
              message: "Maak een functie met de naam gemiddelde.",
            }),
          ],
        },
      ),
  },
  {
    id: "mc-single",
    type: "multiple_choice",
    label: "Meerkeuze (één antwoord)",
    description: "De leerling kiest precies één antwoord.",
    icon: "CircleDot",
    build: () => ({
      type: "multiple_choice",
      title: "Meerkeuzevraag",
      prompt: "Wat print de volgende code?\n\n```python\nprint(7 // 2)\n```",
      points: 1,
      data: multipleChoiceDataSchema.parse({
        multiple: false,
        shuffle: true,
        scoring: "all_or_nothing",
        options: [
          newOption({ text: "`3`", correct: true }),
          newOption({ text: "`3.5`" }),
          newOption({ text: "`4`" }),
          newOption({ text: "`1`" }),
        ],
      }),
    }),
  },
  {
    id: "mc-multiple",
    type: "multiple_choice",
    label: "Meerkeuze (meerdere antwoorden)",
    description:
      "Meerdere antwoorden kunnen goed zijn; punten per goede keuze.",
    icon: "ListChecks",
    build: () => ({
      type: "multiple_choice",
      title: "Meerdere antwoorden",
      prompt:
        "Welke van deze namen zijn **geldige** variabelenamen in Python? Kies alle goede antwoorden.",
      points: 2,
      data: multipleChoiceDataSchema.parse({
        multiple: true,
        shuffle: true,
        scoring: "partial",
        options: [
          newOption({ text: "`leeftijd`", correct: true }),
          newOption({ text: "`_teller`", correct: true }),
          newOption({ text: "`2getal`" }),
          newOption({ text: "`mijn-naam`" }),
        ],
      }),
    }),
  },
  {
    id: "open",
    type: "open",
    label: "Open vraag",
    description:
      "De leerling schrijft een antwoord in eigen woorden; jij kijkt het na.",
    icon: "MessageSquareText",
    build: () => ({
      type: "open",
      title: "Open vraag",
      prompt:
        "Leg in je eigen woorden uit wat een variabele is. Geef een voorbeeld.",
      points: 2,
      data: openQuestionDataSchema.parse({
        modelAnswer:
          "Een variabele is een naam waaronder je een waarde bewaart, zodat je die later kunt gebruiken of veranderen. Voorbeeld: leeftijd = 15.",
        rubric: "1 punt: juiste uitleg. 1 punt: passend voorbeeld.",
      } satisfies Partial<OpenQuestionData>),
    }),
  },
];

const TEMPLATE_BY_ID = new Map(QUESTION_TEMPLATES.map((t) => [t.id, t]));

export function isQuestionTemplateId(id: string): id is QuestionTemplateId {
  return TEMPLATE_BY_ID.has(id as QuestionTemplateId);
}

export function getQuestionTemplate(id: string): QuestionTemplate | undefined {
  return TEMPLATE_BY_ID.get(id as QuestionTemplateId);
}

/** The template used when only a type is given. */
export const DEFAULT_TEMPLATE_FOR_TYPE: Record<
  QuestionType,
  QuestionTemplateId
> = {
  code: "code-empty",
  multiple_choice: "mc-single",
  open: "open",
};

/** Build a question from a template id, or from the default template of a type. */
export function buildQuestionDraft(
  type: QuestionType,
  templateId?: string,
): QuestionDraft {
  const template = getQuestionTemplate(
    templateId ?? DEFAULT_TEMPLATE_FOR_TYPE[type],
  );
  if (!template) throw new Error(`Onbekend sjabloon: ${templateId}`);
  if (template.type !== type) {
    throw new Error(
      `Sjabloon ${template.id} hoort bij type ${template.type}, niet bij ${type}`,
    );
  }
  return template.build();
}
