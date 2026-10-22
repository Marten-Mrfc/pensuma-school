/**
 * Students for "Herkansing plannen" on the results page. Pure module.
 *  - failed: submitted with a grade below 5,5
 *  - missed: no submitted attempt (not started or still busy)
 * Students who left the class are skipped.
 */
export type RetakeRow = {
  student: { id: string; inClass: boolean };
  attempt: { status: string; grade: number | null } | null;
};

export function retakeGroups(rows: readonly RetakeRow[]): {
  failed: string[];
  missed: string[];
} {
  const failed: string[] = [];
  const missed: string[] = [];
  for (const r of rows) {
    if (!r.student.inClass) continue;
    if (!r.attempt || r.attempt.status !== "submitted")
      missed.push(r.student.id);
    else if (r.attempt.grade != null && r.attempt.grade < 5.5)
      failed.push(r.student.id);
  }
  return { failed, missed };
}
