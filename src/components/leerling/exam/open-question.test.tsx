import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { OpenQuestion } from "./open-question";

function render(value: string, maxLength?: number | null) {
  return renderToStaticMarkup(
    <OpenQuestion value={value} onChange={() => {}} maxLength={maxLength} />,
  );
}

describe("OpenQuestion length limit (A24)", () => {
  test("without a teacher limit the field still stops at the server's 20.000", () => {
    expect(render("")).toContain('maxLength="20000"');
    expect(render("", null)).toContain('maxLength="20000"');
  });

  test("a teacher limit above 20.000 is capped; a lower one is kept", () => {
    expect(render("", 50_000)).toContain('maxLength="20000"');
    expect(render("", 500)).toContain('maxLength="500"');
  });

  test("the counter shows the 20.000 limit once the answer gets close", () => {
    expect(render("abc")).toContain("3 tekens");
    expect(render("abc")).not.toContain("van 20.000");
    const near = render("x".repeat(18_500));
    expect(near).toContain("18.500 van 20.000 tekens");
    // The counter is then part of the field's description.
    const counterId = near.match(/id="([^"]+-counter)"/)?.[1];
    expect(counterId).toBeTruthy();
    expect(near).toMatch(
      new RegExp(`aria-describedby="[^"]*${counterId}[^"]*"`),
    );
  });

  test("with a teacher limit the counter is always shown", () => {
    expect(render("abc", 500)).toContain("3 van 500 tekens");
  });
});

describe("OpenQuestion placeholder contrast (A09)", () => {
  test("the placeholder uses the full muted-foreground colour", () => {
    const html = render("");
    expect(html).toContain("placeholder:text-muted-foreground");
    expect(html).not.toMatch(/placeholder:text-muted-foreground\/\d+/);
  });
});
