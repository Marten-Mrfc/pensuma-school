/**
 * Example test “Lussen en lijsten”.
 */
import { fn, io, md, options, type PortableTestInput } from "./build";

export const lussenLijstenExample: PortableTestInput = {
  format: "pensuma-toets",
  version: 1,
  test: {
    title: "Lussen en lijsten",
    topic: "Python – lussen en lijsten",
    description: md(
      "Oefen met `for`- en `while`-lussen en met lijsten: aftellen, tafels, optellen en zoeken.",
      "",
      "Lees elke opdracht goed: soms mag je een bepaalde functie **niet** gebruiken.",
    ),
  },
  questions: [
    {
      type: "code",
      title: "Aftellen",
      points: 2,
      tags: ["for-lus"],
      prompt: md(
        "Vraag de gebruiker om een startgetal en tel af tot en met **1**. Print elk getal op een eigen regel.",
        "",
        "**Voorbeeld:** bij de invoer `10` print je programma `10`, `9`, `8` … tot en met `1`, onder elkaar.",
        "",
        "Gebruik een `for`-lus met `range()`.",
      ),
      data: {
        starterCode: 'start = int(input("Startgetal: "))\n',
        solution: md(
          'start = int(input("Startgetal: "))',
          "for getal in range(start, 0, -1):",
          "    print(getal)",
          "",
        ),
        tests: [
          io("t1", "10", "10\n9\n8\n7\n6\n5\n4\n3\n2\n1"),
          io("t2", "3", "3\n2\n1", { hidden: true }),
        ],
        checks: [
          {
            id: "c1",
            kind: "requires",
            construct: "for_loop",
            message: "Gebruik een for-lus.",
          },
        ],
      },
    },
    {
      type: "code",
      title: "Tafel van n",
      points: 2,
      tags: ["for-lus", "rekenen"],
      prompt: md(
        "Vraag de gebruiker om een getal `n` en print de tafel van `n`, van `1 x n` tot en met `10 x n`.",
        "",
        "**Voorbeeld** bij de invoer `7`:",
        "",
        "```",
        "1 x 7 = 7",
        "2 x 7 = 14",
        "...",
        "10 x 7 = 70",
        "```",
      ),
      data: {
        starterCode: 'n = int(input("Welke tafel? "))\n',
        solution: md(
          'n = int(input("Welke tafel? "))',
          "for i in range(1, 11):",
          '    print(i, "x", n, "=", i * n)',
          "",
        ),
        tests: [
          io("t1", "7", "7\n14\n21\n28\n35\n42\n49\n56\n63\n70", {
            name: "Invoer: 7 (de uitkomsten 7 tot en met 70)",
          }),
          io("t2", "3", "3\n6\n9\n12\n15\n18\n21\n24\n27\n30", {
            hidden: true,
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
      },
    },
    {
      type: "code",
      title: "Optellen tot ‘stop’",
      points: 3,
      tags: ["while-lus", "invoer en uitvoer", "rekenen"],
      prompt: md(
        "Vraag steeds opnieuw om een getal, totdat de gebruiker `stop` intypt. Print daarna **alleen het totaal** van alle getallen.",
        "",
        "**Voorbeeld:** bij de invoer `5`, `3` en `stop` print je programma bijvoorbeeld `Totaal: 8`.",
        "",
        "Gebruik een `while`-lus. Typt de gebruiker meteen `stop`, dan is het totaal `0`.",
      ),
      data: {
        starterCode: "totaal = 0\n",
        solution: md(
          "totaal = 0",
          'invoer = input("Getal (of stop): ")',
          'while invoer != "stop":',
          "    totaal = totaal + float(invoer)",
          '    invoer = input("Getal (of stop): ")',
          'print("Totaal:", totaal)',
          "",
        ),
        tests: [
          io("t1", "5\n3\nstop", "8"),
          io("t2", "10\n20\n30\nstop", "60"),
          io("t3", "stop", "0", { hidden: true }),
          io("t4", "2.5\n2.5\n-1\nstop", "4", { hidden: true }),
        ],
        checks: [
          {
            id: "c1",
            kind: "requires",
            construct: "while_loop",
            message: "Gebruik een while-lus.",
          },
        ],
      },
    },
    {
      type: "code",
      title: "Grootste getal zonder max()",
      points: 3,
      tags: ["lijsten", "for-lus", "algoritmen", "functies"],
      prompt: md(
        "Schrijf een functie `grootste(getallen)` die het **grootste getal** uit een lijst teruggeeft (met `return`).",
        "",
        "```python",
        "grootste([3, 8, 2])     # geeft 8",
        "grootste([-5, -2, -9])  # geeft -2",
        "```",
        "",
        "Je mag de ingebouwde functie `max()` **niet** gebruiken. De lijst is nooit leeg.",
      ),
      data: {
        starterCode:
          "def grootste(getallen):\n    # jouw code hier\n    pass\n",
        solution: md(
          "def grootste(getallen):",
          "    hoogste = getallen[0]",
          "    for getal in getallen:",
          "        if getal > hoogste:",
          "            hoogste = getal",
          "    return hoogste",
          "",
        ),
        tests: [
          fn("t1", "grootste([3, 8, 2])", "8"),
          fn("t2", "grootste([-5, -2, -9])", "-2"),
          fn("t3", "grootste([4])", "4", { hidden: true }),
          fn("t4", "grootste([1, 7, 7, 3])", "7", { hidden: true }),
        ],
        checks: [
          {
            id: "c1",
            kind: "requires",
            construct: "function_def",
            value: "grootste",
            message: "Maak een functie met de naam grootste.",
          },
          {
            id: "c2",
            kind: "forbids",
            construct: "function_call",
            value: "max",
            message: "Je mag max() niet gebruiken.",
          },
        ],
      },
    },
    {
      type: "code",
      title: "Aantal klinkers",
      points: 2,
      tags: ["strings", "for-lus", "invoer en uitvoer"],
      prompt: md(
        "Vraag de gebruiker om een woord of zin en print hoeveel **klinkers** (a, e, i, o, u) erin staan. Hoofdletters tellen ook mee.",
        "",
        "**Voorbeeld:** bij de invoer `informatica` print je programma bijvoorbeeld `Aantal klinkers: 5`.",
      ),
      data: {
        starterCode: 'tekst = input("Tekst: ")\n',
        solution: md(
          'tekst = input("Tekst: ")',
          "aantal = 0",
          "for letter in tekst.lower():",
          '    if letter in "aeiou":',
          "        aantal = aantal + 1",
          'print("Aantal klinkers:", aantal)',
          "",
        ),
        tests: [
          io("t1", "informatica", "5"),
          io("t2", "Python", "1"),
          io("t3", "AEIOU zijn klinkers", "8", { hidden: true }),
        ],
      },
    },
    {
      type: "code",
      title: "Lijst omdraaien",
      points: 3,
      tags: ["lijsten", "for-lus", "functies"],
      prompt: md(
        "Schrijf een functie `omdraaien(lijst)` die een **nieuwe lijst** teruggeeft met dezelfde elementen in omgekeerde volgorde.",
        "",
        "```python",
        "omdraaien([1, 2, 3])    # geeft [3, 2, 1]",
        "omdraaien([\"a\", \"b\"])  # geeft ['b', 'a']",
        "```",
        "",
        "Je mag de functie `reversed()` **niet** gebruiken.",
      ),
      data: {
        starterCode: "def omdraaien(lijst):\n    # jouw code hier\n    pass\n",
        solution: md(
          "def omdraaien(lijst):",
          "    nieuw = []",
          "    for element in lijst:",
          "        nieuw.insert(0, element)",
          "    return nieuw",
          "",
        ),
        tests: [
          fn("t1", "omdraaien([1, 2, 3])", "[3, 2, 1]"),
          fn("t2", 'omdraaien(["a", "b"])', "['b', 'a']"),
          fn("t3", "omdraaien([])", "[]", { hidden: true }),
          fn("t4", "omdraaien([5, 5, 1])", "[1, 5, 5]", { hidden: true }),
        ],
        checks: [
          {
            id: "c1",
            kind: "forbids",
            construct: "function_call",
            value: "reversed",
            message: "Je mag reversed() niet gebruiken.",
          },
        ],
      },
    },
    {
      type: "multiple_choice",
      title: "range met een stap",
      points: 1,
      tags: ["for-lus", "lijsten"],
      prompt: "Welke getallen staan er in `list(range(2, 10, 3))`?",
      data: {
        options: options(
          ["`[2, 5, 8]`", "`[2, 5, 8, 11]`", "`[3, 6, 9]`", "`[2, 3, 4]`"],
          0,
        ),
        shuffle: true,
      },
    },
    {
      type: "multiple_choice",
      title: "Negatieve index",
      points: 1,
      tags: ["lijsten"],
      prompt: "Wat is de waarde van `[3, 1, 4][-1]`?",
      data: {
        options: options(
          ["`4`", "`3`", "`1`", "Een foutmelding (`IndexError`)"],
          0,
        ),
        shuffle: true,
      },
    },
  ],
};
