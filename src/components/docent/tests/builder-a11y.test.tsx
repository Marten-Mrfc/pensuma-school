/**
 * Test builder:
 * - A39: the "Problemen" tile counts every error that blocks publishing
 *   (also test-level ones), like the Publiceren badge;
 * - X08: a refused question delete keeps the unsaved edits;
 * - A03: the "Vraag toevoegen" button stays focusable while a question is
 *   being created; the question editor exposes its focus targets;
 * - A20: the status filter on /docent/toetsen is a real radio group.
 */
import { describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { createRenderer, tagsMatching, textOf } from "../a11y/render-for-test";
import { AddQuestionMenu, focusMovedOutOfMenu } from "./add-question-menu";
import { deleteQuestionKeepingEdits } from "./delete-question";
import { QuestionList } from "./question-list";
import { TestsPage } from "./tests-page";

function renderList(props: {
  errorCount: number;
  questions?: { id: string; type: "code"; title: string; points: number }[];
}) {
  const { render } = createRenderer();
  return render(
    <QuestionList
      questions={props.questions ?? []}
      issuesById={{}}
      selection={{ kind: "settings" }}
      onSelect={() => {}}
      onMove={() => {}}
      onReorder={() => {}}
      onAdd={() => {}}
      adding={false}
      settingsTitle="Toets H3"
      settingsHasIssue={false}
      errorCount={props.errorCount}
    />,
  );
}

/** The "Problemen" tile: its opening tag and its number. */
function problemsTile(html: string) {
  const at = html.indexOf(">Problemen</dt>");
  const open = html.lastIndexOf("<div", at);
  const tile = html.slice(open, html.indexOf("</div>", at));
  return {
    tag: tile.slice(0, tile.indexOf(">") + 1),
    value: textOf(tile.slice(tile.indexOf("<dd"))),
  };
}

describe("QuestionList Problemen tile (A39)", () => {
  test("a new test without questions is blocked: not a green 0", () => {
    const tile = problemsTile(renderList({ errorCount: 1 }));
    expect(tile.value).toBe("1");
    expect(tile.tag).toContain("text-destructive-ink");
    expect(tile.tag).not.toContain("text-success-ink");
  });

  test("green only when nothing blocks publishing", () => {
    const tile = problemsTile(
      renderList({
        errorCount: 0,
        questions: [{ id: "q1", type: "code", title: "Begroeting", points: 2 }],
      }),
    );
    expect(tile.value).toBe("0");
    expect(tile.tag).toContain("text-success-ink");
  });

  test("the builder passes every validation error", () => {
    const source = readFileSync(
      path.join(import.meta.dir, "test-builder.tsx"),
      "utf8",
    );
    expect(source).toContain("errorCount={validation.errors.length}");
  });
});

describe("deleteQuestionKeepingEdits (X08)", () => {
  test("a refused delete keeps the draft", async () => {
    const order: string[] = [];
    const discardDraft = mock(() => order.push("discard"));
    await expect(
      deleteQuestionKeepingEdits({
        saveDraft: async () => order.push("save"),
        deleteOnServer: async () => {
          order.push("delete");
          throw new Error("Bewaarplicht: deze vraag kan niet weg.");
        },
        discardDraft,
      }),
    ).rejects.toThrow("Bewaarplicht");
    expect(discardDraft).not.toHaveBeenCalled();
    expect(order).toEqual(["save", "delete"]);
  });

  test("the builder deletes through it (no discard before the delete)", () => {
    const builder = readFileSync(
      path.join(import.meta.dir, "test-builder.tsx"),
      "utf8",
    );
    const confirm = builder.slice(
      builder.indexOf("async function confirmDeleteQuestion("),
      builder.indexOf("async function publish("),
    );
    expect(confirm).toContain("deleteQuestionKeepingEdits({");
    const discardAt = confirm.indexOf("autosave.discard(");
    expect(discardAt).toBeGreaterThan(confirm.indexOf("discardDraft:"));
    expect(confirm.indexOf("deleteQuestionKeepingEdits(")).toBeLessThan(
      discardAt,
    );
  });

  test("the draft is forgotten only after a successful delete", async () => {
    const order: string[] = [];
    await deleteQuestionKeepingEdits({
      saveDraft: async () => order.push("save"),
      deleteOnServer: async () => order.push("delete"),
      discardDraft: () => order.push("discard"),
    });
    expect(order).toEqual(["save", "delete", "discard"]);
  });
});

describe("AddQuestionMenu while adding (A03)", () => {
  test("the trigger is aria-disabled, not disabled (focus stays on it)", () => {
    const { render } = createRenderer();
    const html = render(<AddQuestionMenu onAdd={() => {}} pending />);
    const [button] = tagsMatching(html, /<button/);
    expect(button).toContain('aria-disabled="true"');
    expect(button).not.toMatch(/\sdisabled=""/);
  });

  test("a full test really disables it", () => {
    const { render } = createRenderer();
    const html = render(<AddQuestionMenu onAdd={() => {}} disabled />);
    expect(tagsMatching(html, /<button/)[0]).toMatch(/\sdisabled=""/);
  });
});

describe("AddQuestionMenu closing (A03)", () => {
  // Minimal stand-ins for DOM elements (bun runs without a DOM).
  const body = { isConnected: true } as unknown as Element;
  const el = (connected = true) =>
    ({ isConnected: connected }) as unknown as Element;
  const menuWith = (...children: Element[]) =>
    ({
      contains: (node: Element) => children.includes(node),
    }) as unknown as EventTarget;

  test("the new question's title got focus first: the menu leaves it there", () => {
    // The server answered before the close animation ended.
    const title = el();
    expect(focusMovedOutOfMenu(title, body, menuWith())).toBe(true);
  });

  test("still waiting for the server: focus goes back to the trigger", () => {
    expect(focusMovedOutOfMenu(body, body, menuWith())).toBe(false);
    expect(focusMovedOutOfMenu(null, body, menuWith())).toBe(false);
    // The chosen item, already removed with the menu.
    expect(focusMovedOutOfMenu(el(false), body, menuWith())).toBe(false);
  });

  test("focus inside the menu itself is not a reason to keep it", () => {
    const item = el();
    expect(focusMovedOutOfMenu(item, body, menuWith(item))).toBe(false);
  });

  test("the menu content uses it when it closes", () => {
    const source = readFileSync(
      path.join(import.meta.dir, "add-question-menu.tsx"),
      "utf8",
    );
    const content = source.slice(source.indexOf("<DropdownMenuContent"));
    expect(content.slice(0, 600)).toContain("onCloseAutoFocus");
    expect(content.slice(0, 600)).toContain("focusMovedOutOfMenu(");
  });
});

describe("builder focus targets (A03)", () => {
  const builder = readFileSync(
    path.join(import.meta.dir, "test-builder.tsx"),
    "utf8",
  );

  test("adding or duplicating a question focuses its title", () => {
    const add = builder.slice(
      builder.indexOf("async function addQuestion("),
      builder.indexOf("async function moveQuestion("),
    );
    expect(add).toContain("focusTitleOf.current = res.question.id");
    expect(builder).toContain("titleRef={titleInputRef}");
  });

  test("the delete dialog has somewhere to return focus to", () => {
    expect(builder).toContain("returnFocusRef={afterDeleteFocus}");
    expect(builder).toContain("headingRef={editorHeadingRef}");
    expect(builder).toContain("headingRef={settingsHeadingRef}");
  });
});

describe("status filter on /docent/toetsen (A20)", () => {
  test("a radio group with one Tab stop: the checked filter", () => {
    const { queryClient, trpc, render } = createRenderer();
    queryClient.setQueryData(
      trpc.test.list.queryKey({ search: undefined, status: "active" }),
      [],
    );
    const html = render(<TestsPage />);
    const radios = tagsMatching(html, /role="radio"/);
    expect(radios.length).toBe(5);
    expect(radios.filter((t) => t.includes('tabindex="0"')).length).toBe(1);
    const active = radios.find((t) => t.includes('aria-checked="true"'));
    expect(active).toContain('tabindex="0"');
  });
});
