import { describe, expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import {
  CodeSplitLayout,
  EDITOR_TOOLS_HANDLE_LABEL,
  PROMPT_EDITOR_HANDLE_LABEL,
} from "./code-split-layout";

function separators(html: string): string[] {
  return [...html.matchAll(/<[^>]*role="separator"[^>]*>/g)].map((m) => m[0]);
}

describe("resizable handles of a code question (A07)", () => {
  test("both handles have a name; the side-by-side one is vertical", () => {
    const html = renderToStaticMarkup(
      <CodeSplitLayout
        prompt={<p>Opdracht</p>}
        editor={<p>Editor</p>}
        tools={<p>Uitvoer</p>}
      />,
    );
    const handles = separators(html);
    expect(handles).toHaveLength(2);
    const [promptEditor, editorTools] = handles as [string, string];
    expect(promptEditor).toContain(
      `aria-label="${PROMPT_EDITOR_HANDLE_LABEL}"`,
    );
    // Between stacked panels: a horizontal line (V12: set by
    // ResizableHandle from its group, not by hand at each call site).
    expect(promptEditor).toContain('aria-orientation="horizontal"');
    expect(editorTools).toContain(`aria-label="${EDITOR_TOOLS_HANDLE_LABEL}"`);
    expect(editorTools).toContain('aria-orientation="vertical"');
    expect(PROMPT_EDITOR_HANDLE_LABEL).toBe(
      "Hoogte van opdracht en code aanpassen",
    );
    expect(EDITOR_TOOLS_HANDLE_LABEL).toBe(
      "Breedte van code en uitvoer aanpassen",
    );
  });

  test("without run/test tools there is only the named height handle", () => {
    const html = renderToStaticMarkup(
      <CodeSplitLayout
        prompt={<p>Opdracht</p>}
        editor={<p>Editor</p>}
        tools={null}
      />,
    );
    const handles = separators(html);
    expect(handles).toHaveLength(1);
    expect(handles[0]).toContain(`aria-label="${PROMPT_EDITOR_HANDLE_LABEL}"`);
  });
});
