/**
 * Time budget of one grading job: all code questions of one submission,
 * graded in one sandbox job (see `gradeCodeBatch`).
 *
 * - Hard limit: no test starts once `totalMs` (GRADER_JOB_TIMEOUT_MS) has
 *   passed, so one submission holds a grader slot for at most about
 *   `totalMs` plus one test.
 * - Round-robin (`runPhase`): test 1 of every question runs before test 2
 *   of any question, so a slow question can't push the other questions'
 *   tests past the deadline.
 * - Fair share for code that misbehaves: every question has a share of
 *   `totalMs / questions`. Once a question's code has timed out or crashed,
 *   it only starts another test when the worst case (its time limit) still
 *   fits in its share, or in time that no other question can claim any
 *   more. An endless loop in one question therefore never uses up the time
 *   of the student's other questions, which would otherwise be marked
 *   "niet meer uitgevoerd".
 * - Code that runs normally (no timeouts) is not limited by its share:
 *   legitimately slow programs keep running until the hard limit.
 */

/** Rough cost of replacing a sandbox after a timeout (fresh one from the pool). */
export const RESPAWN_MARGIN_MS = 1_000;

export class JobBudget {
  private readonly deadline: number;
  private readonly share: number;
  private readonly spent: number[];
  private readonly troubled: boolean[];
  private readonly finished: boolean[];

  /**
   * @param totalMs     budget of the whole job
   * @param timeLimits  per question: the time limit of one test
   * @param clock       current time in ms (tests use a fake clock)
   */
  constructor(
    totalMs: number,
    private readonly timeLimits: readonly number[],
    readonly clock: () => number = Date.now,
  ) {
    this.deadline = clock() + totalMs;
    this.share = totalMs / Math.max(1, timeLimits.length);
    this.spent = timeLimits.map(() => 0);
    this.troubled = timeLimits.map(() => false);
    this.finished = timeLimits.map(() => false);
  }

  /** Whether question `i` may start its next test now. */
  mayStart(i: number): boolean {
    const t = this.clock();
    if (t >= this.deadline) return false;
    if (!this.troubled[i]) return true;
    const worstCase = this.timeLimits[i] + RESPAWN_MARGIN_MS;
    if (this.spent[i] + worstCase <= this.share) return true;
    return this.deadline - t - this.reservedByOthers(i) >= worstCase;
  }

  /** Book a finished test of question `i` (`troubled`: it timed out or crashed). */
  record(i: number, durationMs: number, troubled: boolean): void {
    this.spent[i] += Math.max(0, durationMs);
    if (troubled) this.troubled[i] = true;
  }

  /** Question `i` has no tests left: its unused share becomes spare time. */
  finish(i: number): void {
    this.finished[i] = true;
  }

  private reservedByOthers(i: number): number {
    let reserved = 0;
    for (let j = 0; j < this.spent.length; j++) {
      if (j === i || this.finished[j]) continue;
      reserved += Math.max(0, this.share - this.spent[j]);
    }
    return reserved;
  }
}

/**
 * Run one phase of tests round-robin over the questions: test 1 of every
 * question, then test 2, and so on. Before each test the budget decides
 * whether it runs (`execute`, which returns true when the code timed out or
 * crashed) or is skipped (`skip`). `lastPhase[i]`: question `i` has no tests
 * after this phase, so it is finished after its last one here.
 */
export async function runPhase<T>(
  budget: JobBudget,
  tests: ReadonlyArray<ReadonlyArray<T>>,
  lastPhase: ReadonlyArray<boolean>,
  execute: (question: number, test: T) => Promise<boolean>,
  skip: (question: number, test: T) => void,
): Promise<void> {
  tests.forEach((list, i) => {
    if (list.length === 0 && lastPhase[i]) budget.finish(i);
  });
  const rounds = tests.reduce((max, list) => Math.max(max, list.length), 0);
  for (let k = 0; k < rounds; k++) {
    for (let i = 0; i < tests.length; i++) {
      const list = tests[i];
      if (k >= list.length) continue;
      if (budget.mayStart(i)) {
        const started = budget.clock();
        const troubled = await execute(i, list[k]);
        budget.record(i, budget.clock() - started, troubled);
      } else {
        skip(i, list[k]);
      }
      if (k === list.length - 1 && lastPhase[i]) budget.finish(i);
    }
  }
}
