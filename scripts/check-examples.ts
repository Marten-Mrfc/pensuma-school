/**
 * Runs the model solution of every code question in the example tests
 * (src/lib/questions/examples) through the real server grader and expects
 * a full score (fraction 1, all tests and checks passed).
 *
 * Run: bun run examples:check
 *   (tsx --conditions=react-server --env-file=.env scripts/check-examples.ts)
 * Exit code 1 when a solution does not pass.
 */
import { EXAMPLE_TESTS } from "@/lib/questions/examples";
import { gradeCode } from "@/server/grader";
import { getGraderPool } from "@/server/grader/pool";

async function main() {
  let failures = 0;
  let checked = 0;
  for (const example of EXAMPLE_TESTS) {
    console.log(`\n${example.test.test.title}`);
    for (const [index, q] of example.test.questions.entries()) {
      if (q.type !== "code") continue;
      checked++;
      const label = `  Vraag ${index + 1}: ${q.title}`;
      try {
        const result = await gradeCode({
          code: q.data.solution,
          tests: q.data.tests,
          checks: q.data.checks,
          timeLimitMs: q.data.timeLimitMs,
        });
        const ok =
          result.status === "ok" &&
          result.fraction === 1 &&
          result.tests.length === q.data.tests.length &&
          result.tests.every((t) => t.passed) &&
          result.checks.every((c) => c.passed);
        if (ok) {
          console.log(`${label}: ok (${result.tests.length} tests)`);
        } else {
          failures++;
          console.log(
            `${label}: MISLUKT (status ${result.status}, score ${result.fraction})`,
          );
          for (const t of result.tests.filter((t) => !t.passed)) {
            console.log(
              `    - ${t.name || t.testId}: ${t.feedback ?? t.error?.message ?? "niet geslaagd"}`,
            );
            if (t.actual !== undefined) console.log(`      kreeg: ${t.actual}`);
          }
          for (const c of result.checks.filter((c) => !c.passed)) {
            console.log(`    - controle ${c.checkId}: ${c.message}`);
          }
          if (result.error) console.log(`    fout: ${result.error.message}`);
        }
      } catch (error) {
        failures++;
        console.log(`${label}: FOUT ${String(error)}`);
      }
    }
  }
  console.log(
    `\n${checked - failures} van ${checked} modeloplossingen krijgen alle punten.`,
  );
  return failures;
}

main()
  .then((failures) => {
    getGraderPool().close();
    process.exit(failures ? 1 : 0);
  })
  .catch((error) => {
    console.error(error);
    getGraderPool().close();
    process.exit(1);
  });
