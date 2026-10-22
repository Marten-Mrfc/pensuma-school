import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { Markdown } from "./markdown";

function render(source: string): string {
  return renderToStaticMarkup(<Markdown>{source}</Markdown>);
}

describe("Markdown security", () => {
  test("javascript: links are neutralised", () => {
    const html = render("[x](javascript:alert(1))");
    expect(html).not.toContain("javascript:");
  });

  test("raw HTML with event handlers is dropped", () => {
    const html = render("<img src=x onerror=alert(1)>");
    expect(html).not.toContain("onerror");
    expect(html).not.toContain("<img");
  });

  test("script tags are dropped", () => {
    const html = render("Hallo <script>alert(1)</script> wereld");
    expect(html).not.toContain("<script");
  });

  test("data: URLs stay blocked in links", () => {
    const html = render("[x](data:text/html;base64,PHNjcmlwdD4=)");
    expect(html).not.toContain("data:");
    expect(render("[x](data:image/png;base64,iVBORw0KGgo=)")).not.toContain(
      "data:",
    );
  });

  test("encoded tabs or backslashes can't make a protocol-relative image", () => {
    for (const source of [
      "![a](</\t/evil.example/p.png>)",
      "![a](/&#9;/evil.example/p.png)",
      "![a](/&#92;evil.example/p.png)",
    ]) {
      const html = render(source);
      expect(html).not.toMatch(/src="\/[\s\\/]/);
    }
  });
});

describe("Markdown external content (privacy)", () => {
  test("an external image is not loaded but offered as a link", () => {
    const html = render("![a](https://evil.example/p.png)");
    expect(html).not.toMatch(/<img[^>]+src="https?:/);
    expect(html).not.toContain("<img");
    expect(html).toContain("Externe afbeelding (niet automatisch geladen): a");
    expect(html).toContain('href="https://evil.example/p.png"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("(opent in een nieuw tabblad)");
  });

  test("a protocol-relative image is not loaded either", () => {
    expect(render("![a](//evil.example/p.png)")).not.toContain("<img");
  });

  test("a same-origin image is rendered without referrer", () => {
    const html = render("![Pensuma-logo](/logo.png)");
    expect(html).toMatch(/<img[^>]+src="\/logo.png"/);
    expect(html).toContain('alt="Pensuma-logo"');
    expect(html).toContain('referrerPolicy="no-referrer"');
    expect(html).toContain('loading="lazy"');
  });

  test("a base64 data image is rendered", () => {
    const html = render("![Diagram](data:image/png;base64,iVBORw0KGgo=)");
    expect(html).toMatch(/<img[^>]+src="data:image\/png;base64,iVBORw0KGgo="/);
    expect(html).not.toContain("Externe afbeelding");
  });

  test("other data images are not loaded", () => {
    const html = render("![x](data:image/bmp;base64,Qk0=)");
    expect(html).not.toContain("<img");
    expect(html).not.toContain("data:");
  });

  test("an image without alt text gets an empty alt", () => {
    expect(render("![](/logo.png)")).toContain('alt=""');
  });

  test("external links open in a new tab and say so", () => {
    const html = render("[Python-docs](https://docs.python.org)");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer"');
    expect(html).toContain("(opent in een nieuw tabblad)");
  });

  test("internal links stay in the same tab", () => {
    const html = render("[Resultaten](/leerling/resultaten)");
    expect(html).not.toContain('target="_blank"');
    expect(html).not.toContain("nieuw tabblad");
  });
});

describe("Markdown accessibility", () => {
  test("tables sit in a focusable, named scroll region", () => {
    const html = render("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(html).toMatch(/<section[^>]+aria-label="Tabel"[^>]+tabindex="0"/i);
  });

  test("headings are shifted one level down", () => {
    expect(render("# Titel")).toContain("<h2");
  });
});
