/**
 * Pure demo question data (no database imports), shared by the demo seeding
 * and the grader tests (every code question's model solution must pass).
 */
import {
  codeQuestionDataSchema,
  multipleChoiceDataSchema,
  openQuestionDataSchema,
  type QuestionType,
} from "@/lib/questions/schema";

export type SeedQuestion = {
  type: QuestionType;
  title: string;
  prompt: string;
  points: number;
  data: Record<string, unknown>;
};

const io = (
  id: string,
  stdin: string,
  expectedOutput: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  kind: "io",
  name: stdin ? `Invoer: ${stdin.split("\n").join(", ")}` : "Uitvoer",
  stdin,
  expectedOutput,
  ...extra,
});

const fn = (
  id: string,
  call: string,
  expected: string,
  extra: Record<string, unknown> = {},
) => ({
  id,
  kind: "function",
  name: `${call} → ${expected}`,
  call,
  expected,
  ...extra,
});

export const DEMO_QUESTIONS: SeedQuestion[] = [
  {
    type: "code",
    title: "Hallo wereld",
    points: 1,
    prompt: "Schrijf een programma dat de tekst **Hallo wereld!** print.",
    data: codeQuestionDataSchema.parse({
      starterCode: "# Schrijf hieronder je code\n",
      solution: 'print("Hallo wereld!")\n',
      tests: [io("t1", "", "Hallo wereld")],
    }),
  },
  {
    type: "code",
    title: "Begroeting",
    points: 2,
    prompt: [
      "Vraag de gebruiker om zijn of haar naam met `input()` en print daarna een begroeting.",
      "",
      "**Voorbeeld** – als de gebruiker `Mark` invoert, print je programma:",
      "",
      "```",
      "Hallo Mark",
      "```",
      "",
      'Je mag zelf weten wat je tussen de haakjes van `input()` zet, bijvoorbeeld `input("Wat is je naam? ")`.',
    ].join("\n"),
    data: codeQuestionDataSchema.parse({
      starterCode: "# Vraag de naam en print een begroeting\n",
      solution: 'naam = input("Wat is je naam? ")\nprint("Hallo " + naam)\n',
      tests: [
        io("t1", "Mark", "Hallo Mark"),
        io("t2", "Fatima", "Hallo Fatima", { hidden: true }),
      ],
    }),
  },
  {
    type: "code",
    title: "Valuta-omrekenaar",
    points: 3,
    prompt: [
      "Maak een valuta-omrekenaar van **euro naar dollar**.",
      "",
      "- Vraag de gebruiker om een bedrag in euro.",
      "- De koers is: 1 euro = 1.08 dollar.",
      "- Print het bedrag in dollar.",
      "",
      "Voorbeeld: bij invoer `100` print je programma bijvoorbeeld `100.0 euro is 108.0 dollar`.",
      "",
      "> Tip: `input()` geeft altijd tekst terug. Gebruik `float()` om er een getal van te maken.",
    ].join("\n"),
    data: codeQuestionDataSchema.parse({
      starterCode: "KOERS = 1.08\n\n",
      solution:
        'KOERS = 1.08\n\neuro = float(input("Bedrag in euro: "))\ndollar = euro * KOERS\nprint(euro, "euro is", round(dollar, 2), "dollar")\n',
      tests: [
        io("t1", "100", "108", { match: "numbers" }),
        io("t2", "25", "27", { match: "numbers" }),
        io("t3", "12.5", "13.5", { match: "numbers", hidden: true }),
      ],
    }),
  },
  {
    type: "code",
    title: "Even getallen",
    points: 2,
    prompt: [
      "Je krijgt een lijst met getallen. Print **alleen de even getallen**, elk op een eigen regel.",
      "",
      "Gebruik een `for`-lus.",
    ].join("\n"),
    data: codeQuestionDataSchema.parse({
      starterCode: "getallen = [3, 8, 15, 22, 7, 10, 41, 6]\n\n",
      solution:
        "getallen = [3, 8, 15, 22, 7, 10, 41, 6]\n\nfor getal in getallen:\n    if getal % 2 == 0:\n        print(getal)\n",
      tests: [
        io("t1", "", "8\n22\n10\n6", {
          name: "Even getallen uit de lijst",
          match: "exact",
        }),
      ],
      checks: [
        {
          id: "c1",
          kind: "requires",
          construct: "for_loop",
          message: "Gebruik een for-lus.",
        },
      ],
    }),
  },
  {
    type: "code",
    title: "Gemiddelde",
    points: 3,
    prompt: [
      "Schrijf een functie `gemiddelde(getallen)` die het **gemiddelde** van een lijst getallen teruggeeft (met `return`).",
      "",
      "```python",
      "gemiddelde([1, 2, 3])   # geeft 2.0",
      "gemiddelde([10])        # geeft 10.0",
      "```",
      "",
      "Je hoeft zelf niets te printen. Gebruik géén `statistics`-module.",
    ].join("\n"),
    data: codeQuestionDataSchema.parse({
      starterCode:
        "def gemiddelde(getallen):\n    # jouw code hier\n    pass\n",
      solution:
        "def gemiddelde(getallen):\n    return sum(getallen) / len(getallen)\n",
      tests: [
        fn("t1", "gemiddelde([1, 2, 3])", "2.0"),
        fn("t2", "gemiddelde([10])", "10.0"),
        fn("t3", "gemiddelde([2.5, 3.5])", "3.0"),
        fn("t4", "gemiddelde([-4, 4, 9])", "3.0", { hidden: true }),
      ],
      checks: [
        {
          id: "c1",
          kind: "requires",
          construct: "function_def",
          value: "gemiddelde",
          message: "Maak een functie met de naam gemiddelde.",
        },
        {
          id: "c2",
          kind: "forbids",
          construct: "import",
          value: "statistics",
          message: "Je mag de statistics-module niet gebruiken.",
        },
      ],
    }),
  },
  {
    type: "multiple_choice",
    title: "Gehele deling",
    points: 1,
    prompt: "Wat print de volgende code?\n\n```python\nprint(7 // 2)\n```",
    data: multipleChoiceDataSchema.parse({
      options: [
        { id: "a", text: "`3`", correct: true },
        { id: "b", text: "`3.5`" },
        { id: "c", text: "`4`" },
        { id: "d", text: "`1`" },
      ],
    }),
  },
  {
    type: "multiple_choice",
    title: "Geldige variabelenamen",
    points: 2,
    prompt:
      "Welke van deze namen zijn **geldige** variabelenamen in Python? Kies alle goede antwoorden.",
    data: multipleChoiceDataSchema.parse({
      multiple: true,
      scoring: "partial",
      options: [
        { id: "a", text: "`leeftijd`", correct: true },
        { id: "b", text: "`_teller`", correct: true },
        { id: "c", text: "`2getal`" },
        { id: "d", text: "`mijn-naam`" },
        { id: "e", text: "`totaal_prijs`", correct: true },
      ],
    }),
  },
  {
    type: "code",
    title: "Mag ik stemmen?",
    points: 2,
    prompt: [
      "Vraag de leeftijd van de gebruiker.",
      "",
      "- Is de leeftijd 18 of hoger? Print dan `Je mag stemmen`.",
      "- Anders print je `Je mag nog niet stemmen`.",
    ].join("\n"),
    data: codeQuestionDataSchema.parse({
      solution:
        'leeftijd = int(input("Hoe oud ben je? "))\nif leeftijd >= 18:\n    print("Je mag stemmen")\nelse:\n    print("Je mag nog niet stemmen")\n',
      tests: [
        io("t1", "18", "Je mag stemmen"),
        io("t2", "15", "Je mag nog niet stemmen"),
        io("t3", "42", "Je mag stemmen", { hidden: true }),
      ],
      checks: [{ id: "c1", kind: "requires", construct: "if_statement" }],
    }),
  },
  {
    type: "code",
    title: "Tafel van vermenigvuldiging",
    points: 2,
    prompt: [
      "Vraag een getal `n` en print de tafel van `n` van 1 tot en met 10.",
      "",
      "Voorbeeld bij invoer `3`:",
      "",
      "```",
      "1 x 3 = 3",
      "2 x 3 = 6",
      "...",
      "10 x 3 = 30",
      "```",
    ].join("\n"),
    data: codeQuestionDataSchema.parse({
      solution:
        'n = int(input("Getal: "))\nfor i in range(1, 11):\n    print(i, "x", n, "=", i * n)\n',
      tests: [
        io(
          "t1",
          "3",
          Array.from(
            { length: 10 },
            (_, i) => `${i + 1} x 3 = ${(i + 1) * 3}`,
          ).join("\n"),
        ),
        io(
          "t2",
          "7",
          Array.from(
            { length: 10 },
            (_, i) => `${i + 1} x 7 = ${(i + 1) * 7}`,
          ).join("\n"),
          { hidden: true },
        ),
      ],
    }),
  },
  {
    type: "code",
    title: "Optellen tot stop",
    points: 3,
    prompt: [
      "Lees steeds een getal in met `input()`, totdat de gebruiker `stop` typt.",
      "Print daarna de **som** van alle ingevoerde getallen.",
      "",
      "Gebruik een `while`-lus.",
    ].join("\n"),
    data: codeQuestionDataSchema.parse({
      solution:
        'som = 0\ninvoer = input("Getal (of stop): ")\nwhile invoer != "stop":\n    som += int(invoer)\n    invoer = input("Getal (of stop): ")\nprint("De som is", som)\n',
      tests: [
        io("t1", "4\n7\n9\nstop", "20", { match: "numbers" }),
        io("t2", "stop", "0", { match: "numbers" }),
        io("t3", "100\n-50\n1\nstop", "51", { match: "numbers", hidden: true }),
      ],
      checks: [
        {
          id: "c1",
          kind: "requires",
          construct: "while_loop",
          message: "Gebruik een while-lus.",
        },
      ],
    }),
  },
  {
    type: "code",
    title: "Grootste van drie",
    points: 2,
    prompt:
      "Schrijf een functie `grootste(a, b, c)` die het grootste van de drie getallen teruggeeft. Je mag de ingebouwde functie `max()` **niet** gebruiken.",
    data: codeQuestionDataSchema.parse({
      starterCode: "def grootste(a, b, c):\n    pass\n",
      solution:
        "def grootste(a, b, c):\n    if a >= b and a >= c:\n        return a\n    if b >= c:\n        return b\n    return c\n",
      tests: [
        fn("t1", "grootste(1, 2, 3)", "3"),
        fn("t2", "grootste(9, 4, 7)", "9"),
        fn("t3", "grootste(-1, -5, -3)", "-1", { hidden: true }),
      ],
      checks: [
        {
          id: "c1",
          kind: "forbids",
          construct: "function_call",
          value: "max",
          message: "Je mag max() niet gebruiken.",
        },
      ],
    }),
  },
  {
    type: "open",
    title: "for of while?",
    points: 2,
    prompt:
      "Leg in je eigen woorden uit wat het verschil is tussen een `for`-lus en een `while`-lus. Geef bij allebei een voorbeeld van wanneer je hem zou gebruiken.",
    data: openQuestionDataSchema.parse({
      modelAnswer:
        "Een for-lus herhaalt voor elk element van een reeks (of een vast aantal keer, met range). Een while-lus herhaalt zolang een voorwaarde waar is, handig als je vooraf niet weet hoe vaak.",
      rubric:
        "1 punt: juist verschil uitgelegd. 1 punt: passend voorbeeld bij beide lussen.",
    }),
  },
];
