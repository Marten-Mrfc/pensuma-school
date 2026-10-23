/**
 * V04: when entering fullscreen fails, the student reads why inside the
 * overlay (role="alert" under the button): a toast would sit outside its
 * focus trap, hidden from keyboard and screen-reader users.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { FULLSCREEN_FAILED, FullscreenActions } from "./fullscreen-overlay";

const noop = () => {};

describe("fullscreen overlay error (V04)", () => {
  test("the error shows under the 'Volledig scherm' button", () => {
    const html = renderToStaticMarkup(
      <FullscreenActions
        error={FULLSCREEN_FAILED}
        onEnter={noop}
        onHandIn={noop}
      />,
    );
    const button = html.indexOf("Volledig scherm</button>");
    const alert = html.indexOf('role="alert"');
    expect(button).toBeGreaterThan(-1);
    expect(alert).toBeGreaterThan(button);
    expect(html).toContain(FULLSCREEN_FAILED);
    // The button is described by the error, so a retry hears it again.
    const id = html.match(/<p id="([^"]+)" role="alert"/)?.[1];
    expect(id).toBeTruthy();
    expect(html).toContain(`aria-describedby="${id}"`);
  });

  test("the advice is one that works (F11 does not end the overlay)", () => {
    expect(FULLSCREEN_FAILED).toBe(
      "Volledig scherm lukte niet. Probeer het nog een keer of vraag je docent om hulp.",
    );
    expect(FULLSCREEN_FAILED).not.toContain("F11");
  });

  test("no alert without an error", () => {
    const html = renderToStaticMarkup(
      <FullscreenActions error={null} onEnter={noop} onHandIn={noop} />,
    );
    expect(html).not.toContain('role="alert"');
    expect(html).not.toContain("aria-describedby");
  });

  test("the exam shows the failure in the overlay, not in a toast", () => {
    const source = readFileSync(
      path.join(import.meta.dir, "exam-runner.tsx"),
      "utf8",
    );
    expect(source).toContain("setFullscreenError(FULLSCREEN_FAILED)");
    expect(source).toContain("error={fullscreenError}");
    expect(source).not.toContain("Volledig scherm lukte niet");
  });
});
