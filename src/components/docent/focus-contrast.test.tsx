/**
 * - V05: the attempt rows on a student's page draw the same visible focus
 *   ring as the dashboard rows, not only a faint tint;
 * - V06: placeholders in teacher forms use the full muted-foreground
 *   colour (no extra transparency that drops below 4.5:1).
 */
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import type { RouterOutputs } from "@/trpc/react";
import {
  createRenderer,
  fulfilled,
  tagsMatching,
} from "./a11y/render-for-test";
import { LIST_ROW_LINK } from "./dashboard/dashboard-view";
import { StudentDetailPage } from "./students/student-detail-page";

type Student = RouterOutputs["student"]["get"];

const ID = "u-focus";
const ASSIGNMENT = "a-focus";
const ATTEMPT = "t-focus";

function renderStudentWithAttempt(): string {
  const student = {
    id: ID,
    name: "Sem de Vries",
    studentNumber: "17054",
    banned: false,
    banReason: null,
    createdAt: new Date("2026-09-01T08:00:00Z"),
    hasPin: true,
    lastLoginAt: null,
    restricted: false,
    classes: [],
    attempts: [
      {
        id: ATTEMPT,
        assignmentId: ASSIGNMENT,
        assignmentTitle: "Proeftoets",
        attemptNumber: 1,
        className: "4H2",
        mode: "exam",
        status: "submitted",
        gradingStatus: "graded",
        startedAt: new Date("2026-10-20T09:00:00Z"),
        submittedAt: new Date("2026-10-20T09:40:00Z"),
        score: 8,
        maxScore: 10,
        focusLossCount: 0,
      },
    ],
    loginLockedUntil: null,
    recentFailures: 0,
    accommodation: null,
  } as unknown as Student;
  const { queryClient, trpc, render } = createRenderer();
  queryClient.setQueryData(trpc.student.get.queryKey({ id: ID }), student);
  return render(<StudentDetailPage params={fulfilled({ leerlingId: ID })} />);
}

describe("student page: attempt rows show focus (V05)", () => {
  test("the attempt link has the dashboard rows' inset focus ring", () => {
    const html = renderStudentWithAttempt();
    const [link] = tagsMatching(
      html,
      new RegExp(`href="/docent/afnames/${ASSIGNMENT}/pogingen/${ATTEMPT}"`),
    );
    expect(link).toBeDefined();
    const classes = (link?.match(/class="([^"]*)"/)?.[1] ?? "").split(/\s+/);
    const ring = LIST_ROW_LINK.split(/\s+/).filter(
      (c) => c.includes("ring") || c.startsWith("forced-colors:"),
    );
    expect(ring).toEqual([
      "focus-visible:ring-[3px]",
      "focus-visible:ring-ring",
      "focus-visible:ring-inset",
      "forced-colors:focus-visible:-outline-offset-2!",
    ]);
    for (const c of ring) expect(classes).toContain(c);
  });
});

const root = path.resolve(import.meta.dir, "../..");

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const file = path.join(dir, name);
    if (statSync(file).isDirectory()) return sourceFiles(file);
    return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [file] : [];
  });
}

describe("placeholder contrast (V06)", () => {
  test("no form outside the component library fades its placeholder", () => {
    const ui = path.join(root, "components", "ui") + path.sep;
    const offenders = [path.join(root, "components"), path.join(root, "app")]
      .flatMap(sourceFiles)
      .filter((file) => !file.startsWith(ui))
      .filter((file) =>
        /placeholder:(text-muted-foreground\/|opacity-)/.test(
          readFileSync(file, "utf8"),
        ),
      )
      .map((file) => path.relative(root, file));
    expect(offenders).toEqual([]);
  });

  test("the import list and the test title use the full muted colour", () => {
    for (const file of [
      "components/docent/classes/import-students-panel.tsx",
      "components/docent/tests/test-builder.tsx",
    ]) {
      expect(readFileSync(path.join(root, file), "utf8")).toMatch(
        /placeholder:text-muted-foreground[\s"]/,
      );
    }
  });
});
