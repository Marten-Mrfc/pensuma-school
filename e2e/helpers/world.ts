/** Ids of the seeded demo world (same names in both E2E modes). */
import { DEFAULT_STUDENT, DEMO_TEST, PRACTICE_AFNAME } from "../support/env";
import {
  findAssignment,
  findDemoClass,
  findStudentId,
  findTest,
  type TrpcApi,
} from "./trpc";

export type DemoWorld = {
  classId: string;
  studentId: string;
  testId: string;
  practiceId: string;
};

export async function loadDemoWorld(api: TrpcApi): Promise<DemoWorld> {
  const [klas, test, practice, studentId] = await Promise.all([
    findDemoClass(api),
    findTest(api, DEMO_TEST),
    findAssignment(api, PRACTICE_AFNAME),
    findStudentId(api, DEFAULT_STUDENT.number),
  ]);
  if (!studentId) {
    throw new Error(`[e2e] Student ${DEFAULT_STUDENT.number} not found`);
  }
  return {
    classId: klas.id,
    studentId,
    testId: test.id,
    practiceId: practice.id,
  };
}

/** A unique 8-digit leerlingnummer for throwaway students. */
export function throwawayNumber(prefix = "8"): string {
  return `${prefix}${Date.now().toString().slice(-6)}${Math.floor(Math.random() * 10)}`;
}
