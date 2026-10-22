/**
 * Example test “Functies”.
 */
import { fn, md, options, type PortableTestInput } from "./build";

export const functiesExample: PortableTestInput = {
  format: "pensuma-toets",
  version: 1,
  test: {
    title: "Functies",
    topic: "Python – functies",
    description: md(
      "Schrijf je eigen functies met parameters en `return`.",
      "",
      "Bij deze vragen kijken we wat je functie **teruggeeft**. Je hoeft zelf niets te printen.",
    ),
  },
  questions: [
    {
      type: "code",
      title: "Kwadraat",
      points: 1,
      tags: ["functies", "rekenen"],
      prompt: md(
        "Schrijf een functie `kwadraat(x)` die het kwadraat van `x` teruggeeft.",
        "",
        "```python",
        "kwadraat(3)   # geeft 9",
        "```",
      ),
      data: {
        starterCode: "def kwadraat(x):\n    # jouw code hier\n    pass\n",
        solution: "def kwadraat(x):\n    return x * x\n",
        tests: [
          fn("t1", "kwadraat(3)", "9"),
          fn("t2", "kwadraat(-4)", "16"),
          fn("t3", "kwadraat(0)", "0", { hidden: true }),
          fn("t4", "kwadraat(2.5)", "6.25", { hidden: true }),
        ],
      },
    },
    {
      type: "code",
      title: "is_even",
      points: 2,
      tags: ["functies", "voorwaarden", "datatypes"],
      prompt: md(
        "Schrijf een functie `is_even(n)` die `True` teruggeeft als `n` even is, en anders `False`.",
        "",
        "```python",
        "is_even(4)   # geeft True",
        "is_even(7)   # geeft False",
        "```",
      ),
      data: {
        starterCode: "def is_even(n):\n    # jouw code hier\n    pass\n",
        solution: "def is_even(n):\n    return n % 2 == 0\n",
        tests: [
          fn("t1", "is_even(4)", "True"),
          fn("t2", "is_even(7)", "False"),
          fn("t3", "is_even(0)", "True", { hidden: true }),
          fn("t4", "is_even(-3)", "False", { hidden: true }),
        ],
      },
    },
    {
      type: "code",
      title: "Gemiddelde",
      points: 3,
      tags: ["functies", "lijsten", "rekenen"],
      prompt: md(
        "Schrijf een functie `gemiddelde(getallen)` die het gemiddelde van een lijst getallen teruggeeft.",
        "",
        "Is de lijst leeg, dan geeft de functie `0` terug (en dus geen foutmelding).",
        "",
        "```python",
        "gemiddelde([1, 2, 3])   # geeft 2.0",
        "gemiddelde([])          # geeft 0",
        "```",
      ),
      data: {
        starterCode:
          "def gemiddelde(getallen):\n    # jouw code hier\n    pass\n",
        solution: md(
          "def gemiddelde(getallen):",
          "    if len(getallen) == 0:",
          "        return 0",
          "    return sum(getallen) / len(getallen)",
          "",
        ),
        tests: [
          fn("t1", "gemiddelde([1, 2, 3])", "2.0"),
          fn("t2", "gemiddelde([5, 10])", "7.5"),
          fn("t3", "gemiddelde([])", "0", {
            name: "Lege lijst → 0",
            hidden: true,
          }),
          fn("t4", "gemiddelde([-2, 2, 6])", "2.0", { hidden: true }),
        ],
        checks: [
          {
            id: "c1",
            kind: "requires",
            construct: "function_def",
            value: "gemiddelde",
            message: "Maak een functie met de naam gemiddelde.",
          },
        ],
      },
    },
    {
      type: "code",
      title: "Oordeel bij een cijfer",
      points: 3,
      tags: ["functies", "voorwaarden"],
      prompt: md(
        "Schrijf een functie `oordeel(cijfer)` die een oordeel teruggeeft als tekst:",
        "",
        "| Cijfer | Oordeel |",
        "| --- | --- |",
        "| lager dan 5.5 | `onvoldoende` |",
        "| 5.5 tot 8 | `voldoende` |",
        "| 8 of hoger | `goed` |",
        "",
        "```python",
        'oordeel(6.8)   # geeft "voldoende"',
        "```",
      ),
      data: {
        starterCode: "def oordeel(cijfer):\n    # jouw code hier\n    pass\n",
        solution: md(
          "def oordeel(cijfer):",
          "    if cijfer < 5.5:",
          '        return "onvoldoende"',
          "    elif cijfer < 8:",
          '        return "voldoende"',
          "    else:",
          '        return "goed"',
          "",
        ),
        tests: [
          fn("t1", "oordeel(4.2)", '"onvoldoende"'),
          fn("t2", "oordeel(6.8)", '"voldoende"'),
          fn("t3", "oordeel(8.5)", '"goed"'),
          fn("t4", "oordeel(5.5)", '"voldoende"', { hidden: true }),
          fn("t5", "oordeel(8)", '"goed"', { hidden: true }),
        ],
        checks: [
          {
            id: "c1",
            kind: "requires",
            construct: "if_statement",
            message: "Gebruik if, elif en else.",
          },
        ],
      },
    },
    {
      type: "code",
      title: "Woorden tellen",
      points: 2,
      tags: ["functies", "strings"],
      prompt: md(
        "Schrijf een functie `tel_woorden(zin)` die teruggeeft hoeveel woorden er in de zin staan. Woorden worden gescheiden door spaties (soms meer dan één).",
        "",
        "```python",
        'tel_woorden("Ik leer Python")   # geeft 3',
        "```",
        "",
        "> Tip: bekijk wat `zin.split()` doet.",
      ),
      data: {
        starterCode: "def tel_woorden(zin):\n    # jouw code hier\n    pass\n",
        solution: "def tel_woorden(zin):\n    return len(zin.split())\n",
        tests: [
          fn("t1", 'tel_woorden("Ik leer Python")', "3"),
          fn("t2", 'tel_woorden("hallo")', "1"),
          fn("t3", 'tel_woorden("")', "0", { hidden: true }),
          fn("t4", 'tel_woorden("  veel   spaties  hier ")', "3", {
            hidden: true,
          }),
        ],
      },
    },
    {
      type: "code",
      title: "Celsius naar Fahrenheit",
      points: 2,
      tags: ["functies", "rekenen"],
      prompt: md(
        "Schrijf een functie `celsius_naar_fahrenheit(c)` die een temperatuur in graden Celsius omrekent naar Fahrenheit.",
        "",
        "De formule is: **F = C × 9 / 5 + 32**.",
        "",
        "```python",
        "celsius_naar_fahrenheit(100)   # geeft 212.0",
        "```",
      ),
      data: {
        starterCode:
          "def celsius_naar_fahrenheit(c):\n    # jouw code hier\n    pass\n",
        solution:
          "def celsius_naar_fahrenheit(c):\n    return c * 9 / 5 + 32\n",
        tests: [
          fn("t1", "celsius_naar_fahrenheit(0)", "32.0"),
          fn("t2", "celsius_naar_fahrenheit(100)", "212.0"),
          fn("t3", "celsius_naar_fahrenheit(-40)", "-40.0", { hidden: true }),
          fn("t4", "celsius_naar_fahrenheit(37)", "98.6", { hidden: true }),
        ],
      },
    },
    {
      type: "multiple_choice",
      title: "Functie zonder return",
      points: 1,
      tags: ["functies"],
      prompt: md(
        "Wat geeft deze functie terug?",
        "",
        "```python",
        "def groet(naam):",
        '    print("Hallo", naam)',
        "",
        'x = groet("Sam")',
        "```",
      ),
      data: {
        options: options(
          [
            "`None`: zonder `return` geeft een functie niets terug",
            '`"Hallo Sam"`',
            "`0`",
            "Een foutmelding",
          ],
          0,
        ),
        shuffle: true,
      },
    },
    {
      type: "open",
      title: "Waarom functies?",
      points: 2,
      tags: ["functies"],
      prompt: "Waarom zijn functies handig? Noem twee redenen.",
      data: {
        modelAnswer: md(
          "- Je hoeft code niet steeds opnieuw te schrijven: je roept de functie gewoon opnieuw aan (hergebruik).",
          "- Je programma wordt overzichtelijker, omdat je het opdeelt in kleine stukken met een duidelijke naam.",
          "- Een fout hoef je maar op één plek te verbeteren, en je kunt een functie los testen.",
        ),
        rubric: "Elke goede reden is 1 punt (maximaal 2).",
        rubricItems: [
          { id: "r1", label: "Eerste goede reden", points: 1 },
          { id: "r2", label: "Tweede goede reden", points: 1 },
        ],
        maxLength: 1500,
      },
    },
  ],
};
