/**
 * "Afname plannen" form and the monitor's minutes dialog:
 * - A25: a herkansing/opnieuw-plannen link whose toets (or klas) can't be
 *   planned never preselects a different one;
 * - A21: hints and errors are linked to their controls;
 * - A22: invalid minutes are explained instead of silently disabling the
 *   submit button.
 */
import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { tagsMatching, textOf } from "../a11y/render-for-test";
import { initialFormState } from "./assignment-form-payload";
import { Field, fieldDescribedBy } from "./field";
import {
  MINUTES_ERROR,
  MINUTES_HINT,
  MinutesField,
  parseExtraMinutes,
} from "./minutes-field";

const PUBLISHED = { id: "t-published", title: "Python basis – oefentoets" };
const ARCHIVED_ID = "2cb893f6-0000-4000-8000-000000000001";

describe("initialFormState (A25)", () => {
  test("an archived toets in the link is not swapped for the only published one", () => {
    const params = new URLSearchParams({
      toets: ARCHIVED_ID,
      klas: "c1",
      herkansing: "a1",
    });
    const { state, unavailableTestId } = initialFormState(
      { tests: [PUBLISHED], classes: [{ id: "c1" }] },
      params,
    );
    expect(state.testId).toBe("");
    expect(state.title).toBe("");
    expect(state.retakeOfId).toBe("a1");
    expect(unavailableTestId).toBe(ARCHIVED_ID);
  });

  test("an archived klas in the link is not swapped either", () => {
    const { state, unavailableClassId } = initialFormState(
      { tests: [PUBLISHED], classes: [{ id: "c-active" }] },
      new URLSearchParams({ klas: "c-archived", leerlingen: "s1,s2" }),
    );
    expect(state.classIds).toEqual([]);
    // Without a class the student selection can't apply.
    expect(state.studentIds).toBeNull();
    expect(unavailableClassId).toBe("c-archived");
  });

  test("a published toets in the link is used, with the herkansing title", () => {
    const { state, unavailableTestId, unavailableClassId } = initialFormState(
      { tests: [PUBLISHED, { id: "t2", title: "Andere" }], classes: [] },
      new URLSearchParams({ toets: PUBLISHED.id, herkansing: "a1" }),
    );
    expect(state.testId).toBe(PUBLISHED.id);
    expect(state.title).toBe("Herkansing – Python basis – oefentoets");
    expect(unavailableTestId).toBeNull();
    expect(unavailableClassId).toBeNull();
  });

  test("without ?toets/?klas the only option is still preselected", () => {
    const { state, unavailableTestId } = initialFormState(
      { tests: [PUBLISHED], classes: [{ id: "c1" }] },
      new URLSearchParams(),
    );
    expect(state.testId).toBe(PUBLISHED.id);
    expect(state.classIds).toEqual(["c1"]);
    expect(unavailableTestId).toBeNull();
  });
});

describe("Field (A21)", () => {
  test("hint and error have ids that the control can reference", () => {
    const html = renderToStaticMarkup(
      <Field
        label="Tijdslimiet"
        htmlFor="f-limit"
        error="Vul een geheel aantal minuten in."
        hint="Leeg = geen limiet."
      >
        <input
          id="f-limit"
          aria-describedby={fieldDescribedBy("f-limit", {
            hint: true,
            error: true,
          })}
        />
      </Field>,
    );
    expect(html).toContain('id="f-limit-error"');
    // The instruction stays visible (and linked) while there is an error.
    expect(html).toContain('id="f-limit-hint"');
    expect(tagsMatching(html, /<input/)[0]).toContain(
      'aria-describedby="f-limit-error f-limit-hint"',
    );
  });

  test("fieldDescribedBy: only what exists, error first, extra ids last", () => {
    expect(fieldDescribedBy("x", {})).toBeUndefined();
    expect(fieldDescribedBy("x", { hint: true })).toBe("x-hint");
    expect(fieldDescribedBy("x", { error: true })).toBe("x-error");
    expect(
      fieldDescribedBy("x", { hint: true, extra: [false, "x-unavailable"] }),
    ).toBe("x-hint x-unavailable");
  });
});

describe("MinutesField (A22)", () => {
  test("parseExtraMinutes accepts whole minutes from 1 to 600", () => {
    expect(parseExtraMinutes("1")).toBe(1);
    expect(parseExtraMinutes(" 600 ")).toBe(600);
    for (const bad of ["", "0", "601", "900", "-5", "12.5", "abc"]) {
      expect(parseExtraMinutes(bad)).toBeNull();
    }
  });

  test("the range is always shown and linked", () => {
    const html = renderToStaticMarkup(
      <MinutesField id="m" value="10" onChange={() => {}} showError={false} />,
    );
    expect(textOf(html)).toContain(MINUTES_HINT);
    const input = tagsMatching(html, /<input/)[0] ?? "";
    expect(input).toContain('aria-describedby="m-minutes-hint"');
    expect(input).not.toContain("aria-invalid");
  });

  test("after submitting an invalid value the field says what to fix", () => {
    const html = renderToStaticMarkup(
      <MinutesField id="m" value="900" onChange={() => {}} showError />,
    );
    expect(textOf(html)).toContain(MINUTES_ERROR);
    const input = tagsMatching(html, /<input/)[0] ?? "";
    expect(input).toContain('aria-invalid="true"');
    expect(input).toContain(
      'aria-describedby="m-minutes-error m-minutes-hint"',
    );
  });

  test("a valid value shows no error, even after a failed submit", () => {
    const html = renderToStaticMarkup(
      <MinutesField id="m" value="15" onChange={() => {}} showError />,
    );
    expect(textOf(html)).not.toContain(MINUTES_ERROR);
  });
});
