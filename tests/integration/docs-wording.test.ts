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

describe("deployment documentation matches the code", () => {
  const flat = (file: string) => read(file).replace(/\s+/g, " ");

  test("a redeploy waits for grading: stop grace period and healthcheck", () => {
    const compose = read("docker-compose.yml");
    const app = compose.slice(compose.indexOf("\n  app:"));
    expect(app).toMatch(/\n {4}stop_grace_period: 130s\n/);
    expect(read("Dockerfile")).toMatch(
      /HEALTHCHECK --interval=10s --timeout=5s --start-period=40s/,
    );
    const readme = flat("README.md");
    expect(readme).toContain("stop_grace_period: 130s");
    expect(readme).toContain("Stop Grace Period");
    expect(readme).toContain("130 seconden");
  });

  test("Dokploy Applications: Docker log rotation in daemon.json", () => {
    const readme = flat("README.md");
    expect(readme).toContain("/etc/docker/daemon.json");
    expect(readme).toContain('"log-driver": "json-file"');
    expect(readme).toContain('"max-size": "10m", "max-file": "5"');
    // The same numbers as docker-compose.yml's logging block.
    const compose = read("docker-compose.yml");
    expect(compose).toContain('max-size: "10m"');
    expect(compose).toContain('max-file: "5"');
  });

  test("new environment variables are documented with their defaults", () => {
    const env = read(".env.example");
    const readme = flat("README.md");
    expect(env).toContain("# ATTEMPT_SWEEPER=true");
    expect(env).toContain("# MIGRATIONS_WAIT_MS=60000");
    expect(env).toContain("exits with code 1");
    expect(readme).toContain("`ATTEMPT_SWEEPER` | `true`");
    expect(readme).toContain("`MIGRATIONS_WAIT_MS` | `60000`");
    // The grader timeouts as they work now (src/server/grader/config.ts).
    const config = read("src/server/grader/config.ts");
    expect(config).toContain('intEnv("GRADER_JOB_TIMEOUT_MS", 120_000');
    expect(config).toContain('intEnv("GRADER_QUEUE_TIMEOUT_MS", 120_000');
    expect(env).toContain("# GRADER_JOB_TIMEOUT_MS=120000");
    expect(env).toContain("One time budget per submission");
    expect(env).toContain("# GRADER_QUEUE_TIMEOUT_MS=120000");
    expect(env).toContain("waits as long as needed");
    expect(readme).toContain("Eén tijdsbudget per inzending");
    expect(readme).toContain("wacht zo lang als nodig");
    // The defaults in docker-compose.yml are passed through.
    const compose = read("docker-compose.yml");
    const passThrough = (name: string, value: string) =>
      `${name}: $\{${name}:-${value}}`;
    expect(compose).toContain(passThrough("ATTEMPT_SWEEPER", "true"));
    expect(compose).toContain(passThrough("MIGRATIONS_WAIT_MS", "60000"));
  });

  test("the code reads the variables the documents describe", () => {
    expect(read("src/instrumentation.ts")).toContain(
      'process.env.ATTEMPT_SWEEPER !== "false"',
    );
    const migrate = read("src/server/db/migrate.ts");
    expect(migrate).toContain("process.env.MIGRATIONS_WAIT_MS");
    expect(migrate).toContain("const DEFAULT_WAIT_MS = 60_000");
  });
});

describe("the output comparison contract is documented once, consistently", () => {
  test("schema.ts summarises the current rules of compare.ts", () => {
    const flatten = (text: string) => text.replace(/\s*\*\s*/g, " ");
    const schema = read("src/lib/questions/schema.ts");
    const doc = flatten(
      schema.slice(
        schema.lastIndexOf(
          "/**",
          schema.indexOf("export const outputMatchModeSchema"),
        ),
        schema.indexOf("export const outputMatchModeSchema"),
      ),
    );
    const compare = flatten(read("src/lib/grading/compare.ts").split("*/")[0]);
    for (const rule of [
      '"1x3=3"',
      '"Niet geslaagd"',
      '"7 8 9"',
      '"5" never matches inside "15"',
      '"108.50" = "108.5"',
      "time limit",
    ]) {
      expect(compare).toContain(rule);
      expect(doc).toContain(rule);
    }
    expect(doc).toContain("src/lib/grading/compare.ts");
    // The old, too simple rule is gone.
    expect(doc).not.toContain(
      'extra output lines are only allowed when they look like a prompt/heading (end with ":" or "?")',
    );
  });
});
