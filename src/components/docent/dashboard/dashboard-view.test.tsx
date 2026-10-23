import { describe, expect, test } from "bun:test";
import {
  createTestTrpc,
  tagsMatching,
  textOf,
} from "@/components/docent/review/test-render";
import type { RouterOutputs } from "@/trpc/react";
import { DashboardView, LIST_ROW_LINK } from "./dashboard-view";

type Overview = RouterOutputs["dashboard"]["overview"];

const distribution = Array.from({ length: 9 }, (_, i) => ({
  from: i + 1,
  to: i + 2,
  label: `${i + 1}–${i + 2}`,
  count: i === 3 ? 1 : 0,
}));

function overview(lastClosed: Overview["lastClosed"]): Overview {
  return {
    counts: {
      openAssignments: 0,
      plannedAssignments: 1,
      students: 6,
      publishedTests: 1,
      answersNeedingReview: 6,
    },
    activeAssignments: [
      {
        id: "a-planned",
        title: "Toets functies",
        testTitle: "Toets functies",
        className: "4H2",
        mode: "exam",
        effectiveStatus: "planned",
        opensAt: new Date("2026-11-02T08:30:00Z"),
        closesAt: null,
        timeLimitMinutes: 50,
        accessCode: null,
        counts: { students: 6, started: 0, inProgress: 0, submitted: 0 },
      },
    ],
    reviewQueue: [
      {
        assignmentId: "a-review",
        title: "Oefenen: Python basis",
        className: "4H2",
        count: 6,
      },
    ],
    recentSubmissions: [
      {
        attemptId: "at-1",
        assignmentId: "a-review",
        assignmentTitle: "Oefenen: Python basis",
        className: "4H2",
        studentName: "Fatima El Amrani",
        studentNumber: "17023",
        submittedAt: new Date("2026-10-23T09:00:00Z"),
        autoSubmitted: false,
        score: 4,
        maxScore: 10,
        gradingStatus: "graded",
        grade: 4.6,
      },
    ],
    lastClosed,
    serverTime: new Date("2026-10-23T10:00:00Z"),
  } as Overview;
}

function renderDashboard(
  lastClosed: Overview["lastClosed"],
  answersNeedingReview = 6,
) {
  const { queryClient, trpc, render } = createTestTrpc();
  const data = overview(lastClosed);
  data.counts.answersNeedingReview = answersNeedingReview;
  queryClient.setQueryData(trpc.dashboard.overview.queryKey(), data);
  return render(<DashboardView />);
}

const closed = (passed: number, submitted: number) => ({
  id: "a-closed",
  title: "Proeftoets",
  className: "4H2",
  closedAt: new Date("2026-10-20T12:00:00Z"),
  submitted,
  averageGrade: 4.6,
  passed,
  distribution,
});

describe("dashboard list rows: visible focus (A14)", () => {
  test("the row class draws an inset ring, not only a tint", () => {
    const classes = LIST_ROW_LINK.split(/\s+/);
    expect(classes).toContain("focus-visible:ring-[3px]");
    expect(classes).toContain("focus-visible:ring-ring");
    // Inset: the rounded list (overflow-hidden) would clip an outer ring.
    expect(classes).toContain("focus-visible:ring-inset");
    // Forced colors paint no box-shadow; the global outline moves inside.
    expect(classes).toContain("forced-colors:focus-visible:-outline-offset-2!");
  });

  test("Gepland, Te beoordelen and Recent ingeleverd rows all use it", () => {
    const html = renderDashboard(closed(1, 2));
    const rows = [
      ...tagsMatching(html, /href="\/docent\/afnames\/a-planned"/),
      ...tagsMatching(html, /href="\/docent\/afnames\/a-review\/nakijken"/),
      ...tagsMatching(
        html,
        /href="\/docent\/afnames\/a-review\/pogingen\/at-1"/,
      ),
    ];
    expect(rows).toHaveLength(3);
    for (const tag of rows) {
      expect(tag).toContain("focus-visible:ring-inset");
      expect(tag).toContain("focus-visible:ring-ring");
    }
  });
});

describe("dashboard pass-mark sentence agrees with the count (A40)", () => {
  test("one hand-in without a pass mark", () => {
    const text = textOf(renderDashboard(closed(0, 1)));
    expect(text).toContain("1 leerling leverde in en heeft geen voldoende.");
    expect(text).not.toContain("van de 1 leerlingen");
  });

  test("'Te beoordelen': one answer waits, not 'antwoorden wachten'", () => {
    expect(textOf(renderDashboard(closed(1, 2), 1))).toContain(
      "Te beoordelen 1 antwoord wacht op jou",
    );
    expect(textOf(renderDashboard(closed(1, 2), 6))).toContain(
      "Te beoordelen 6 antwoorden wachten op jou",
    );
    expect(textOf(renderDashboard(closed(1, 2), 0))).toContain(
      "Te beoordelen 0 alles is nagekeken",
    );
  });

  test("one of several students passed: 'heeft', not 'hebben'", () => {
    const text = textOf(renderDashboard(closed(1, 4)));
    expect(text).toContain("1 van de 4 leerlingen heeft een voldoende.");
    expect(text).not.toContain("1 van de 4 leerlingen hebben");
  });
});
