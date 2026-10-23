/**
 * Operator and privacy documentation must describe what the code does
 * (no database needed): the network sign-in limit never blocks an
 * address, sessions end differently for students and teachers, and the
 * server's error log is in the processing register.
 */
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import path from "node:path";
import { SESSION_EXPIRY_TEXT } from "@/lib/privacy/register";
import { RESTRICTED_NETWORK_MAX_FAILURES } from "@/server/security/login-throttle";

const root = path.resolve(import.meta.dir, "../..");
const read = (file: string) => readFileSync(path.join(root, file), "utf8");

describe("LOGIN_IP_MAX_FAILURES is documented as it works", () => {
  test(".env.example: stricter student locks, the address is never blocked", () => {
    const env = read(".env.example");
    const block = env.slice(
      env.lastIndexOf("\n\n", env.indexOf("LOGIN_IP_MAX_FAILURES")),
      env.indexOf("LOGIN_IP_MAX_FAILURES=") + 30,
    );
    expect(block).toContain(
      `lock after ${RESTRICTED_NETWORK_MAX_FAILURES} wrong PINs`,
    );
    expect(block).toContain("instead of 8");
    expect(block).toContain("never blocked");
    expect(block).toContain("teachers are never limited by the network");
    expect(block).not.toContain("paused");
  });

  test("src/env.ts and README say the same", () => {
    const envTs = read("src/env.ts");
    const comment = envTs.slice(
      envTs.lastIndexOf("/**", envTs.indexOf("LOGIN_IP_MAX_FAILURES:")),
      envTs.indexOf("LOGIN_IP_MAX_FAILURES:"),
    );
    expect(comment).toContain("never blocked");
    expect(comment).not.toContain("paused");

    const readme = read("README.md").replace(/\s+/g, " ");
    const line = readme.slice(
      readme.indexOf("Veel mislukte inlogpogingen vanaf één netwerk"),
      readme.indexOf("nooit beperkt door het netwerk") + 30,
    );
    expect(line).toContain("`LOGIN_IP_MAX_FAILURES`");
    expect(line).toContain(
      `na ${RESTRICTED_NETWORK_MAX_FAILURES} verkeerde pincodes`,
    );
    expect(line).toContain("Het adres zelf wordt nooit geblokkeerd");
  });
});

describe("privacy documents mirror the register", () => {
  const flat = (file: string) => read(file).replace(/\s+/g, " ");

  test("sessions: 12 hours after signing in for students, after last use for teachers", () => {
    expect(SESSION_EXPIRY_TEXT).toContain("12 uur na het inloggen");
    for (const file of [
      "docs/privacy/verwerkingsregister.md",
      "docs/privacy/privacybijsluiter.md",
    ]) {
      const text = flat(file);
      expect(text).toContain("leerlingen: 12 uur na het inloggen");
      expect(text).toContain("docenten: 12 uur na het laatste gebruik");
      expect(text).not.toContain("(12 uur na laatste gebruik)");
    }
    const statement = flat("src/components/privacy/privacy-statement.tsx");
    expect(statement).toContain("hoogstens 12 uur na het inloggen");
    expect(statement).not.toContain(
      "een sessie verloopt 12 uur nadat je Pensuma voor het laatst hebt gebruikt",
    );
  });

  test("the server's error log is listed with its retention", () => {
    for (const file of [
      "docs/privacy/verwerkingsregister.md",
      "docs/privacy/privacybijsluiter.md",
    ]) {
      const text = flat(file);
      expect(text).toContain("Technische foutmeldingen (serverlogboek)");
      expect(text).toContain("logrotatie");
    }
    expect(flat("src/components/privacy/privacy-statement.tsx")).toContain(
      "Technische foutmeldingen:",
    );
  });

  test("a fullscreen exit with 'vensterwissels niet registreren' does not count", () => {
    expect(flat("src/components/privacy/privacy-statement.tsx")).toContain(
      "maar dat telt dan niet als het verlaten van het venster",
    );
  });
});
