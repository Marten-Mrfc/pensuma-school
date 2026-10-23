import { describe, expect, test } from "bun:test";
import {
  applyToSameLabel,
  identicalAnswersNote,
  passedSentence,
  regradeDescription,
  regradeToast,
  secondsLabel,
  wordCountLabel,
} from "./copy";

describe("passedSentence (A40)", () => {
  test("the verb agrees with the number of students who passed", () => {
    expect(passedSentence(1, 4)).toBe(
      "1 van de 4 leerlingen heeft een voldoende.",
    );
    expect(passedSentence(3, 4)).toBe(
      "3 van de 4 leerlingen hebben een voldoende.",
    );
  });

  test("one hand-in never reads '0 van de 1 leerlingen hebben'", () => {
    expect(passedSentence(0, 1)).toBe(
      "1 leerling leverde in en heeft geen voldoende.",
    );
    expect(passedSentence(1, 1)).toBe(
      "1 leerling leverde in en heeft een voldoende.",
    );
  });

  test("none, all and two students read naturally", () => {
    expect(passedSentence(0, 5)).toBe(
      "Geen van de 5 leerlingen heeft een voldoende.",
    );
    expect(passedSentence(5, 5)).toBe(
      "Alle 5 leerlingen hebben een voldoende.",
    );
    expect(passedSentence(2, 2)).toBe("Beide leerlingen hebben een voldoende.");
    expect(passedSentence(0, 2)).toBe(
      "Geen van beide leerlingen heeft een voldoende.",
    );
    expect(passedSentence(1, 2)).toBe(
      "1 van de 2 leerlingen heeft een voldoende.",
    );
  });

  test("no hand-ins", () => {
    expect(passedSentence(0, 0)).toBe("Nog geen cijfers.");
  });
});

describe("grading identical answers (X09, A40)", () => {
  test("the checkbox says only answers without a manual score change", () => {
    expect(applyToSameLabel(1)).toBe(
      "Ook toepassen op 1 gelijk antwoord zonder handmatige score",
    );
    expect(applyToSameLabel(3)).toBe(
      "Ook toepassen op 3 gelijke antwoorden zonder handmatige score",
    );
  });

  test("the note mentions identical answers that keep their score", () => {
    expect(identicalAnswersNote(1, 0)).toBe(
      "Nog 1 leerling gaf precies hetzelfde antwoord.",
    );
    expect(identicalAnswersNote(3, 0)).toBe(
      "Nog 3 leerlingen gaven precies hetzelfde antwoord.",
    );
    expect(identicalAnswersNote(0, 1)).toBe(
      "Nog 1 leerling gaf precies hetzelfde antwoord. Dat antwoord heeft al een handmatige score en verandert niet mee.",
    );
    expect(identicalAnswersNote(2, 1)).toBe(
      "Nog 3 leerlingen gaven precies hetzelfde antwoord. 1 daarvan heeft al een handmatige score en verandert niet mee.",
    );
    expect(identicalAnswersNote(1, 2)).toBe(
      "Nog 3 leerlingen gaven precies hetzelfde antwoord. 2 daarvan hebben al een handmatige score en veranderen niet mee.",
    );
  });
});

describe("regradeDescription (A40)", () => {
  test("singular and plural", () => {
    expect(regradeDescription(1)).toStartWith(
      "De ingeleverde poging wordt opnieuw automatisch nagekeken",
    );
    expect(regradeDescription(4)).toStartWith(
      "Alle 4 ingeleverde pogingen worden opnieuw automatisch nagekeken",
    );
    expect(regradeDescription(1)).not.toContain("Alle 1");
  });

  test("no number when students handed in more than once", () => {
    // The page only knows the attempt shown per student; the server
    // regrades all of them, so a number there would be too low.
    expect(regradeDescription(null)).toStartWith(
      "Alle ingeleverde pogingen, ook eerdere pogingen van dezelfde leerling, worden",
    );
    expect(regradeDescription(null)).not.toMatch(/\d/);
  });

  test("the toast agrees with the number the server scheduled", () => {
    expect(regradeToast(1)).toBe("1 poging wordt opnieuw nagekeken");
    expect(regradeToast(7)).toBe("7 pogingen worden opnieuw nagekeken");
    expect(regradeToast(0)).toBe("Er is geen poging om opnieuw na te kijken");
  });
});

describe("small counts on the review screens (A40)", () => {
  test("word count of a written answer", () => {
    expect(wordCountLabel("Ja")).toBe("1 woord");
    expect(wordCountLabel("  Een lus herhaalt code  ")).toBe("4 woorden");
    expect(wordCountLabel("")).toBe("0 woorden");
  });

  test("seconds away from the window", () => {
    expect(secondsLabel(1_200)).toBe("1 seconde");
    expect(secondsLabel(400)).toBe("0 seconden");
    expect(secondsLabel(12_000)).toBe("12 seconden");
  });
});
