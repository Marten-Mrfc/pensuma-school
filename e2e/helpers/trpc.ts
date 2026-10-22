/**
 * tRPC over HTTP for E2E setup/cleanup, as the teacher or a student:
 *
 *   const api = await teacherApi();
 *   const klas = await findDemoClass(api);
 *   await api.mutation("student.delete", { id });
 *   await api.dispose();
 *
 * Inputs and outputs use superjson (dates survive both ways).
 */
import { readFileSync } from "node:fs";
import { type APIRequestContext, request } from "@playwright/test";
import superjson from "superjson";
import {
  BASE_URL,
  DEMO_CLASS,
  STUDENT_STATE,
  type StudentLogin,
  TEACHER_STATE,
} from "../support/env";
import {
  cookieHeader,
  type StorageState,
  signInState,
} from "../support/session";

export class TrpcError extends Error {
  constructor(
    readonly path: string,
    readonly code: string,
    message: string,
  ) {
    super(`${path}: ${code} ${message}`);
  }
}

export class TrpcApi {
  constructor(readonly ctx: APIRequestContext) {}

  async query<T = unknown>(path: string, input?: unknown): Promise<T> {
    const qs =
      input === undefined
        ? ""
        : `?input=${encodeURIComponent(JSON.stringify(superjson.serialize(input)))}`;
    const res = await this.ctx.get(`/api/trpc/${path}${qs}`);
    return this.unwrap<T>(path, await res.text());
  }

  async mutation<T = unknown>(path: string, input?: unknown): Promise<T> {
    const res = await this.ctx.post(`/api/trpc/${path}`, {
      headers: { "content-type": "application/json" },
      data: JSON.stringify(
        input === undefined ? {} : superjson.serialize(input),
      ),
    });
    return this.unwrap<T>(path, await res.text());
  }

  private unwrap<T>(path: string, text: string): T {
    let body: {
      result?: { data?: { json: unknown; meta?: unknown } };
      error?: { json?: { message?: string; data?: { code?: string } } };
    };
    try {
      body = JSON.parse(text);
    } catch {
      throw new TrpcError(path, "BAD_RESPONSE", text.slice(0, 200));
    }
    if (body.error) {
      throw new TrpcError(
        path,
        body.error.json?.data?.code ?? "ERROR",
        body.error.json?.message ?? "",
      );
    }
    const data = body.result?.data;
    if (!data) throw new TrpcError(path, "NO_DATA", text.slice(0, 200));
    return superjson.deserialize(
      data as Parameters<typeof superjson.deserialize>[0],
    ) as T;
  }

  dispose(): Promise<void> {
    return this.ctx.dispose();
  }
}

async function apiFor(state: StorageState): Promise<TrpcApi> {
  const ctx = await request.newContext({
    baseURL: BASE_URL,
    extraHTTPHeaders: {
      cookie: cookieHeader(state),
      origin: new URL(BASE_URL).origin,
    },
  });
  return new TrpcApi(ctx);
}

function readState(path: string): StorageState {
  return JSON.parse(readFileSync(path, "utf8")) as StorageState;
}

/** As the seeded teacher (e2e/.auth/docent.json). */
export function teacherApi(): Promise<TrpcApi> {
  return apiFor(readState(TEACHER_STATE));
}

/** As the default student (e2e/.auth/leerling.json). */
export function studentApi(): Promise<TrpcApi> {
  return apiFor(readState(STUDENT_STATE));
}

/** As any student (signs in through the API). */
export async function studentApiFor(login: StudentLogin): Promise<TrpcApi> {
  return apiFor(
    await signInState(BASE_URL, "/api/auth/sign-in/username", {
      username: login.number,
      password: login.pin,
    }),
  );
}

/* --------------------------------- Lookups -------------------------------- */

type ClassRow = { id: string; name: string };
type AssignmentRow = {
  id: string;
  title: string;
  className: string;
  testId: string;
  classId: string;
  mode: string;
};
type TestRow = { id: string; title: string; status: string };

export async function findDemoClass(api: TrpcApi): Promise<ClassRow> {
  const rows = await api.query<ClassRow[]>("class.list", {
    includeArchived: true,
  });
  const klas = rows.find((c) => c.name === DEMO_CLASS);
  if (!klas) throw new Error(`[e2e] Class "${DEMO_CLASS}" not found`);
  return klas;
}

export async function findTest(api: TrpcApi, title: string): Promise<TestRow> {
  const rows = await api.query<TestRow[]>("test.list", { status: "all" });
  const test = rows.find((t) => t.title === title);
  if (!test) throw new Error(`[e2e] Test "${title}" not found`);
  return test;
}

export async function findAssignment(
  api: TrpcApi,
  title: string,
): Promise<AssignmentRow> {
  const rows = await api.query<AssignmentRow[]>("assignment.list");
  const row = rows.find((a) => a.title === title);
  if (!row) throw new Error(`[e2e] Afname "${title}" not found`);
  return row;
}

export async function findStudentId(
  api: TrpcApi,
  number: string,
): Promise<string | null> {
  const out = await api.query<{
    rows: { id: string; studentNumber: string }[];
  }>("student.list", { search: number, pageSize: 100 });
  return out.rows.find((r) => r.studentNumber === number)?.id ?? null;
}

/**
 * Make sure a student with exactly this number, name and PIN exists in the
 * demo class (any older account with the number is replaced). Returns the
 * user id; delete it afterwards with `removeStudent`.
 */
export async function provisionStudent(
  api: TrpcApi,
  login: StudentLogin,
): Promise<string> {
  const existing = await findStudentId(api, login.number);
  if (existing) await api.mutation("student.delete", { id: existing });
  const klas = await findDemoClass(api);
  const created = await api.mutation<{ user: { id: string } }>(
    "student.create",
    {
      studentNumber: login.number,
      name: login.name,
      classId: klas.id,
      pin: login.pin,
    },
  );
  return created.user.id;
}

export async function removeStudent(api: TrpcApi, number: string) {
  const id = await findStudentId(api, number);
  if (id) await api.mutation("student.delete", { id });
}
