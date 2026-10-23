/**
 * Teacher student pages:
 * - X06: a student whose processing is restricted (AVG art. 18) is marked
 *   in the list and on the detail page, with the way to Privacy & gegevens;
 * - X07: the "Vensterwissels niet registreren" help text says what is
 *   still logged, matching the logging rules;
 * - A16: the student, class, test and account forms move focus to the
 *   first invalid field.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { isEventAllowed } from "@/lib/privacy/event-details";
import type { RouterOutputs } from "@/trpc/react";
import { createRenderer, fulfilled, textOf } from "../a11y/render-for-test";
import {
  ClassStudentsTable,
  restrictedMembersInput,
} from "../classes/class-students-table";
import { AccommodationPanel, IGNORE_FOCUS_HELP } from "./accommodation-panel";
import { extraTimeAudience } from "./extra-time-dialog";
import { restrictedSkipNote } from "./format";
import { StudentDetailPage } from "./student-detail-page";
import { RESTRICTED_LABEL } from "./student-status";
import { StudentsPage } from "./students-page";

type Student = RouterOutputs["student"]["get"];
type ListOutput = RouterOutputs["student"]["list"];

const ID = "u-restricted";

const student = (restricted: boolean): Student =>
  ({
    id: ID,
    name: "Sem de Vries",
    studentNumber: "17054",
    banned: restricted,
    banReason: null,
    createdAt: new Date("2026-09-01T08:00:00Z"),
    hasPin: true,
    lastLoginAt: null,
    restricted,
    classes: [],
    attempts: [],
    loginLockedUntil: null,
    recentFailures: 0,
    accommodation: null,
  }) as unknown as Student;

function renderDetail(restricted: boolean) {
  const { queryClient, trpc, render } = createRenderer();
  queryClient.setQueryData(
    trpc.student.get.queryKey({ id: ID }),
    student(restricted),
  );
  return render(<StudentDetailPage params={fulfilled({ leerlingId: ID })} />);
}

describe("restricted processing (X06)", () => {
  test("detail page: badge and a banner that links to Privacy & gegevens", () => {
    const html = renderDetail(true);
    const text = textOf(html);
    expect(text).toContain(RESTRICTED_LABEL);
    expect(text).toContain(
      "De verwerking van de gegevens van deze leerling is beperkt (AVG art. 18).",
    );
    expect(html).toContain('href="/docent/privacy"');
    // Not the "activate it via the menu" text: that is refused while restricted.
    expect(text).not.toContain("Activeer het via het menu");
  });

  test("detail page: nothing extra without a restriction", () => {
    const text = textOf(renderDetail(false));
    expect(text).toContain("Sem de Vries");
    expect(text).not.toContain(RESTRICTED_LABEL);
    expect(text).not.toContain("AVG art. 18");
  });

  test("the facilities can't be changed while restricted", () => {
    const { render } = createRenderer();
    const html = render(
      <AccommodationPanel userId={ID} value={null} restricted />,
    );
    expect(html).toMatch(/<fieldset[^>]*disabled=""/);
    expect(textOf(html)).toContain("De verwerking is beperkt (AVG art. 18)");
  });

  test("student list: the badge in the row", () => {
    const { queryClient, trpc, render } = createRenderer();
    const list: ListOutput = {
      total: 1,
      page: 1,
      pageSize: 25,
      pageCount: 1,
      rows: [
        {
          id: ID,
          name: "Sem de Vries",
          studentNumber: "17054",
          banned: true,
          createdAt: new Date("2026-09-01T08:00:00Z"),
          hasPin: true,
          lastLoginAt: null,
          restricted: true,
          classes: [],
          loginLockedUntil: null,
          recentFailures: 0,
        },
      ],
    } as unknown as ListOutput;
    queryClient.setQueryData(
      trpc.student.list.queryKey({
        search: undefined,
        classId: undefined,
        status: "all",
        page: 1,
        pageSize: 25,
      }),
      list,
    );
    queryClient.setQueryData(
      trpc.class.list.queryKey({ includeArchived: true }),
      [],
    );
    expect(textOf(render(<StudentsPage />))).toContain(RESTRICTED_LABEL);
  });

  test("class page: the badge for a restricted member", () => {
    const CLASS_ID = "7b0c3a4e-5d6f-4a1b-8c9d-0e1f2a3b4c5d";
    const member = (id: string, name: string, banned: boolean) =>
      ({
        id,
        name,
        studentNumber: id === ID ? "17054" : "17053",
        banned,
        hasPin: true,
        lastLoginAt: null,
        loginLockedUntil: null,
      }) as unknown as Parameters<
        typeof ClassStudentsTable
      >[0]["members"][number];
    const { queryClient, trpc, render } = createRenderer();
    queryClient.setQueryData(
      trpc.accommodation.listForClass.queryKey({ classId: CLASS_ID }),
      {},
    );
    queryClient.setQueryData(
      trpc.student.list.queryKey(restrictedMembersInput(CLASS_ID)),
      {
        total: 1,
        page: 1,
        pageSize: 100,
        pageCount: 1,
        rows: [{ id: ID, restricted: true }],
      } as unknown as ListOutput,
    );
    const html = render(
      <ClassStudentsTable
        classId={CLASS_ID}
        members={[
          member(ID, "Sem de Vries", true),
          member("u-other", "Emma Smit", false),
        ]}
      />,
    );
    // Desktop status column and the mobile name cell: one row only.
    expect(html.split(RESTRICTED_LABEL).length - 1).toBe(2);
  });

  test("bulk actions say how many were skipped", () => {
    expect(restrictedSkipNote(0)).toBe("");
    expect(restrictedSkipNote(1)).toBe(
      "1 leerling overgeslagen: voor deze leerling is de verwerking beperkt (AVG art. 18).",
    );
    expect(restrictedSkipNote(3)).toBe(
      "3 leerlingen overgeslagen: voor hen is de verwerking beperkt (AVG art. 18).",
    );
  });

  test("the extra-time dialog keeps its count after a save that skipped some", () => {
    const two = [{ name: "Sem de Vries" }, { name: "Emma Smit" }];
    expect(extraTimeAudience(two, null)).toBe("2 leerlingen");
    expect(extraTimeAudience([{ name: "Sem de Vries" }], null)).toBe(
      "Sem de Vries",
    );
    // The class table clears its selection on save: not "0 leerlingen".
    expect(extraTimeAudience([], { updated: 1, skippedRestricted: 1 })).toBe(
      "2 leerlingen",
    );
  });
});

describe("Vensterwissels niet registreren (X07)", () => {
  // The facility switches logFocusEvents off for this student.
  const facility = { logFocusEvents: false };

  test("code runs are always logged, and the text says so", () => {
    for (const s of [
      { ...facility, requireFullscreen: false, blockPaste: false },
      { ...facility, requireFullscreen: true, blockPaste: true },
    ]) {
      expect(isEventAllowed("code_run", s)).toBe(true);
      expect(isEventAllowed("self_test", s)).toBe(true);
      expect(isEventAllowed("focus_lost", s)).toBe(false);
    }
    expect(IGNORE_FOCUS_HELP).toContain(
      "Uitvoeren en testen van code wordt altijd vastgelegd",
    );
  });

  test("fullscreen exits and blocked pastes only when the toets asks", () => {
    const asks = { ...facility, requireFullscreen: true, blockPaste: true };
    const doesNot = {
      ...facility,
      requireFullscreen: false,
      blockPaste: false,
    };
    expect(isEventAllowed("fullscreen_exit", asks)).toBe(true);
    expect(isEventAllowed("paste", asks)).toBe(true);
    expect(isEventAllowed("fullscreen_exit", doesNot)).toBe(false);
    expect(isEventAllowed("paste", doesNot)).toBe(false);
    expect(IGNORE_FOCUS_HELP).toContain(
      "het verlaten van volledig scherm en geblokkeerd plakken alleen als de toets daarom vraagt",
    );
  });

  test("the panel shows the help text", () => {
    const { render } = createRenderer();
    expect(
      textOf(render(<AccommodationPanel userId={ID} value={null} />)),
    ).toContain("Uitvoeren en testen van code wordt altijd vastgelegd");
  });
});

describe("forms focus the first invalid field (A16)", () => {
  const root = path.resolve(import.meta.dir, "..");
  const read = (file: string) => readFileSync(path.join(root, file), "utf8");

  test.each([
    ["classes/class-form-dialog.tsx", "class-name"],
    ["tests/new-test-dialog.tsx", "titleId"],
    ["students/student-form-dialog.tsx", "ids.number"],
    ["staff/account-page.tsx", "nameId"],
  ])("%s", (file, target) => {
    const source = read(file);
    const call = source.slice(source.indexOf("focusInvalidField("));
    expect(call.slice(0, 80)).toContain(target);
  });

  test("server errors are an alert of their own, not the field error", () => {
    for (const file of [
      "tests/new-test-dialog.tsx",
      "staff/account-page.tsx",
    ]) {
      const source = read(file);
      expect(source).toContain("setFormError(getErrorMessage(");
      expect(source).toContain('role="alert"');
    }
  });
});
