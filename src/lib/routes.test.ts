import { describe, expect, test } from "bun:test";
import { routes } from "./routes";

describe("routes.docent.newAssignment", () => {
  test("without options", () => {
    expect(routes.docent.newAssignment()).toBe("/docent/afnames/nieuw");
    expect(routes.docent.newAssignment({})).toBe("/docent/afnames/nieuw");
    expect(routes.docent.newAssignment({ studentIds: [] })).toBe(
      "/docent/afnames/nieuw",
    );
  });

  test("with test, class, students and retake", () => {
    const url = routes.docent.newAssignment({
      testId: "t-1",
      classId: "k 2",
      studentIds: ["s1", "s2"],
      retakeOf: "a-9",
    });
    const parsed = new URL(url, "https://pensuma.local");
    expect(parsed.pathname).toBe("/docent/afnames/nieuw");
    expect(parsed.searchParams.get("toets")).toBe("t-1");
    expect(parsed.searchParams.get("klas")).toBe("k 2");
    expect(parsed.searchParams.get("leerlingen")).toBe("s1,s2");
    expect(parsed.searchParams.get("herkansing")).toBe("a-9");
  });

  test("encodes values safely", () => {
    const url = routes.docent.newAssignment({ testId: "a&b=c#d" });
    expect(url).not.toContain("#");
    expect(
      new URL(url, "https://pensuma.local").searchParams.get("toets"),
    ).toBe("a&b=c#d");
  });
});

describe("login cards", () => {
  test("studentLoginCards encodes every id", () => {
    const url = routes.docent.studentLoginCards(["a b", "c,d", "e&f#g"]);
    expect(url.startsWith("/print/leerlingen/inlogkaarten?ids=")).toBe(true);
    expect(url).toContain("a%20b");
    expect(url).toContain("c%2Cd");
    expect(url).toContain("e%26f%23g");
    expect(url).not.toContain("#");
  });

  test("studentLoginCards round-trips normal ids", () => {
    const ids = ["0wgJJvG41o1VyGAC59aisDdMlwVEXxfL", "b2c3-d4"];
    const url = routes.docent.studentLoginCards(ids);
    expect(
      new URL(url, "https://pensuma.local").searchParams.get("ids")?.split(","),
    ).toEqual(ids);
  });

  test("classLoginCards", () => {
    expect(routes.docent.classLoginCards("k1")).toBe(
      "/print/klassen/k1/inlogkaarten",
    );
  });
});

describe("static routes", () => {
  test("every route is a Dutch absolute path", () => {
    const paths: string[] = [];
    const walk = (value: unknown) => {
      if (typeof value === "string") paths.push(value);
      else if (typeof value === "function") {
        try {
          paths.push(value("x"));
        } catch {
          paths.push(value(["x"]));
        }
      } else if (value && typeof value === "object")
        for (const v of Object.values(value)) walk(v);
    };
    walk(routes);
    for (const p of paths) {
      expect(p.startsWith("/")).toBe(true);
      expect(p.startsWith("//")).toBe(false);
    }
    expect(routes.leerling.attempt("p1")).toBe("/leerling/poging/p1");
    expect(routes.docent.assignmentAnalysis("a1")).toBe(
      "/docent/afnames/a1/analyse",
    );
    expect(routes.docent.assignmentSimilarity("a1")).toBe(
      "/docent/afnames/a1/vergelijken",
    );
    expect(routes.leerling.myData).toBe("/leerling/mijn-gegevens");
  });
});
