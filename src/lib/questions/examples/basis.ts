/**
 * Example test “Python basis: print, input en rekenen”.
 */
import { io, md, options, type PortableTestInput } from "./build";

export const basisExample: PortableTestInput = {
  format: "pensuma-toets",
  version: 1,
  test: {
    title: "Python basis: print, input en rekenen",
    topic: "Python – basis",
    description: md(
      "Een eerste toets over Python: tekst printen, invoer vragen met `input()` en rekenen met getallen.",
      "",
      "Je mag je code uitvoeren en testen zo vaak als je wilt.",
    ),
  },
  questions: [
    {
      type: "code",
      title: "Hallo wereld",
      points: 1,
      tags: ["invoer en uitvoer"],
      prompt: md(
        "Schrijf een programma dat de tekst **Hallo wereld!** print.",
        "",
        '> Tip: tekst zet je tussen aanhalingstekens, bijvoorbeeld `print("Hoi")`.',
      ),
      data: {
        starterCode: "# Schrijf hieronder je code\n",
        solution: 'print("Hallo wereld!")\n',
        tests: [
          io("t1", "", "Hallo wereld!"),
          io("t2", "", "Hallo wereld", {
            name: "Precies één regel",
            hidden: true,
          }),
        ],
      },
    },
    {
      type: "code",
      title: "Begroeting met input",
      points: 2,
      tags: ["invoer en uitvoer", "variabelen", "strings"],
      prompt: md(
        "Vraag de gebruiker om zijn of haar naam met `input()` en print daarna een begroeting.",
        "",
        "**Voorbeeld:** als de gebruiker `Mark` invoert, print je programma:",
        "",
        "```",
        "Hallo Mark",
        "```",
        "",
        'Wat je tussen de haakjes van `input()` zet, mag je zelf weten, bijvoorbeeld `input("Wat is je naam? ")`. Die vraag telt niet mee bij het nakijken.',
      ),
      data: {
        starterCode: "# Vraag de naam en print een begroeting\n",
        solution: 'naam = input("Wat is je naam? ")\nprint("Hallo " + naam)\n',
        tests: [
          io("t1", "Mark", "Hallo Mark"),
          io("t2", "Fatima", "Hallo Fatima", { hidden: true }),
        ],
      },
    },
    {
      type: "code",
      title: "Optellen",
      points: 2,
      tags: ["invoer en uitvoer", "rekenen", "datatypes"],
      prompt: md(
        "Vraag de gebruiker om **twee hele getallen** (elk met een eigen `input()`) en print de som.",
        "",
        "**Voorbeeld:** bij de invoer `3` en `4` print je programma bijvoorbeeld `De som is 7`.",
        "",
        "> Tip: `input()` geeft tekst terug. Maak er met `int()` een getal van.",
      ),
      data: {
        starterCode: "",
        solution: md(
          'a = int(input("Eerste getal: "))',
          'b = int(input("Tweede getal: "))',
          'print("De som is", a + b)',
          "",
        ),
        tests: [
          io("t1", "3\n4", "7"),
          io("t2", "10\n-2", "8"),
          io("t3", "100\n250", "350", { hidden: true }),
        ],
      },
    },
    {
      type: "code",
      title: "Even of oneven",
      points: 2,
      tags: ["voorwaarden", "rekenen", "invoer en uitvoer"],
      prompt: md(
        "Vraag de gebruiker om een heel getal. Print `even` als het getal even is en anders `oneven`.",
        "",
        "> Tip: met `%` reken je de rest van een deling uit. `7 % 2` is `1`.",
      ),
      data: {
        starterCode: "",
        solution: md(
          'getal = int(input("Geef een getal: "))',
          "if getal % 2 == 0:",
          '    print("even")',
          "else:",
          '    print("oneven")',
          "",
        ),
        tests: [
          io("t1", "4", "even"),
          io("t2", "7", "oneven"),
          io("t3", "0", "even", { hidden: true }),
          io("t4", "-3", "oneven", { hidden: true }),
        ],
        checks: [
          {
            id: "c1",
            kind: "requires",
            construct: "if_statement",
            message: "Gebruik een if-statement.",
          },
        ],
      },
    },
    {
      type: "code",
      title: "Kassabon met 10% korting",
      points: 3,
      tags: ["rekenen", "datatypes", "invoer en uitvoer"],
      prompt: md(
        "Een winkel geeft **10% korting**. Vraag de prijs van een product (een kommagetal, zoals `12.50`) en print:",
        "",
        "1. de korting in euro;",
        "2. het bedrag dat de klant moet betalen.",
        "",
        "**Voorbeeld:** bij de prijs `20` print je programma bijvoorbeeld:",
        "",
        "```",
        "Korting: 2.0 euro",
        "Te betalen: 18.0 euro",
        "```",
        "",
        "Rond af op twee decimalen met `round(bedrag, 2)`.",
      ),
      data: {
        starterCode: 'prijs = float(input("Prijs: "))\n',
        solution: md(
          'prijs = float(input("Prijs: "))',
          "korting = round(prijs * 0.10, 2)",
          "te_betalen = round(prijs - korting, 2)",
          'print("Korting:", korting, "euro")',
          'print("Te betalen:", te_betalen, "euro")',
          "",
        ),
        tests: [
          io("t1", "20", "2\n18", { match: "numbers", tolerance: 0.01 }),
          io("t2", "12.50", "1.25\n11.25", {
            match: "numbers",
            tolerance: 0.01,
          }),
          io("t3", "99.99", "10\n89.99", {
            match: "numbers",
            tolerance: 0.01,
            hidden: true,
          }),
        ],
      },
    },
    {
      type: "multiple_choice",
      title: "Type van input()",
      points: 1,
      tags: ["datatypes", "invoer en uitvoer"],
      prompt: "Welk type geeft `input()` terug?",
      data: {
        options: options(
          [
            "`str` (tekst), ook als de gebruiker een getal intypt",
            "`int` als de gebruiker een heel getal intypt",
            "`float` als de gebruiker een kommagetal intypt",
            "Dat hangt af van wat er tussen de haakjes staat",
          ],
          0,
        ),
        shuffle: true,
      },
    },
    {
      type: "multiple_choice",
      title: "Gehele deling",
      points: 1,
      tags: ["rekenen"],
      prompt: "Wat print `print(7 // 2)`?",
      data: {
        options: options(["`3`", "`3.5`", "`4`", "`1`"], 0),
        shuffle: true,
      },
    },
    {
      type: "open",
      title: "= en ==",
      points: 2,
      tags: ["variabelen", "voorwaarden"],
      prompt:
        "Leg uit wat het verschil is tussen `=` en `==`. Geef bij allebei een voorbeeld.",
      data: {
        modelAnswer: md(
          "Met `=` geef je een variabele een waarde (toekennen), bijvoorbeeld `leeftijd = 15`.",
          "",
          "Met `==` vergelijk je twee waarden; de uitkomst is `True` of `False`, bijvoorbeeld `if leeftijd == 15:`.",
        ),
        rubric:
          "Halve punten mogen als de uitleg klopt maar een voorbeeld ontbreekt.",
        rubricItems: [
          { id: "r1", label: "= is toekennen, met voorbeeld", points: 1 },
          { id: "r2", label: "== is vergelijken, met voorbeeld", points: 1 },
        ],
        maxLength: 1500,
      },
    },
  ],
};
