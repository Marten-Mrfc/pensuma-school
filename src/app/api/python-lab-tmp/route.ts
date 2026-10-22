// TEMPORARY (grader verification) — deleted after testing.
import { gradeCode, runCode } from "@/server/grader";

export async function POST(request: Request) {
  const body = await request.json();
  if (body.mode === "run") return Response.json(await runCode(body.input));
  return Response.json(await gradeCode(body.input));
}
