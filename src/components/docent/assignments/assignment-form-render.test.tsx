/**
 * The rendered "Afname plannen" form (A20, A21, A25).
 */
import { describe, expect, test } from "bun:test";
import type { RouterOutputs } from "@/trpc/react";
import { createRenderer, tagsMatching, textOf } from "../a11y/render-for-test";
import { AssignmentForm } from "./assignment-form";

type Options = RouterOutputs["assignment"]["formOptions"];

const ARCHIVED_TEST = "2cb893f6-0000-4000-8000-000000000001";
const OPTIONS: Options = {
  tests: [
    {
      id: "11111111-1111-4111-8111-111111111111",
      title: "Python basis – oefentoets",
      topic: null,
      updatedAt: new Date("2026-10-01T10:00:00Z"),
      questionCount: 12,
      totalPoints: 30,
    },
  ],
  classes: [
    {
      id: "22222222-2222-4222-8222-222222222222",
      name: "4H2 (demo)",
      schoolYear: "2026-2027",
      studentCount: 6,
    },
  ],
} as Options;

/** The <option> tag of the one published toets. */
function publishedOption(html: string): string {
  return tagsMatching(html, /<option[^>]*value="11111111/)[0] ?? "";
}

function renderForm(search: string) {
  const { queryClient, trpc, render } = createRenderer({ search });
  queryClient.setQueryData(trpc.assignment.formOptions.queryKey(), OPTIONS);
  return render(<AssignmentForm />);
}

describe("herkansing of an archived toets (A25)", () => {
  const html = renderForm(
    `toets=${ARCHIVED_TEST}&klas=${OPTIONS.classes[0].id}&herkansing=33333333-3333-4333-8333-333333333333`,
  );

  test("the only published toets is not silently preselected", () => {
    expect(publishedOption(html)).not.toContain("selected");
    expect(textOf(html)).not.toContain("Herkansing – Python basis");
    // Without a toets in the link it still is (the single option).
    expect(publishedOption(renderForm(""))).toContain('selected=""');
  });

  test("a notice explains why, with a link to the toets", () => {
    const text = textOf(html);
    expect(text).toContain("De toets van deze link kun je nu niet inplannen");
    expect(html).toContain(`href="/docent/toetsen/${ARCHIVED_TEST}"`);
    // The Toets select is described by the notice too.
    expect(tagsMatching(html, /<select/)[0]).toMatch(
      /aria-describedby="[^"]*-unavailable"/,
    );
  });
});

describe("hints are linked to their controls (A21)", () => {
  const html = renderForm("");

  test("Toets, Titel and Tijdslimiet reference their hint", () => {
    const select = tagsMatching(html, /<select/)[0] ?? "";
    expect(select).toMatch(/aria-describedby="[^"]*-test-hint"/);
    const inputs = tagsMatching(html, /<input/);
    expect(
      inputs.some((t) => /aria-describedby="[^"]*-title-hint"/.test(t)),
    ).toBe(true);
    expect(
      inputs.some(
        (t) =>
          t.includes('type="number"') &&
          /aria-describedby="[^"]*-limit-hint"/.test(t),
      ),
    ).toBe(true);
    for (const hint of ["-test-hint", "-title-hint", "-limit-hint"]) {
      expect(html).toMatch(new RegExp(`<p id="[^"]*${hint}"`));
    }
  });
});

describe("card radios have one Tab stop each (A20)", () => {
  const html = renderForm("");

  test("Modus, Start and Toegangscode: only the checked option is tabbable", () => {
    // (The grading-scale choice is a Radix RadioGroup with its own roving
    // focus; only the card-style groups are checked here.)
    const radios = tagsMatching(html, /role="radio"/).filter(
      (t) => !t.includes('data-slot="radio-group-item"'),
    );
    expect(radios.length).toBe(9);
    const checked = radios.filter((t) => t.includes('aria-checked="true"'));
    expect(checked.length).toBe(3);
    for (const tag of radios) {
      expect(tag).toContain(
        tag.includes('aria-checked="true"') ? 'tabindex="0"' : 'tabindex="-1"',
      );
    }
  });
});
