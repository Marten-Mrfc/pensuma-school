import { afterEach, describe, expect, test } from "bun:test";
import { type AuditContext, type AuditDb, actorFromCtx } from "./audit";

const admin = { id: "u-admin", name: "Docent", role: "admin" };
const student = { id: "u-student", name: "Leerling", role: "student" };

function ctx(
  headers: Record<string, string>,
  user: AuditContext["user"] = admin,
): AuditContext {
  return { db: {} as AuditDb, headers: new Headers(headers), user };
}

const originalTrusted = process.env.TRUSTED_PROXIES;
afterEach(() => {
  if (originalTrusted === undefined) delete process.env.TRUSTED_PROXIES;
  else process.env.TRUSTED_PROXIES = originalTrusted;
});

describe("actorFromCtx IP prefix", () => {
  test("ignores a forged left-most X-Forwarded-For entry (TRUSTED_PROXIES)", () => {
    process.env.TRUSTED_PROXIES = "10.0.0.0/8";
    const actor = actorFromCtx(
      ctx({ "x-forwarded-for": "6.6.6.6, 198.51.100.23, 10.0.0.5" }),
    );
    expect(actor.ipPrefix).toBe("198.51.100.0/24");
  });

  test("without TRUSTED_PROXIES a multi-hop chain is not believed: X-Real-IP", () => {
    delete process.env.TRUSTED_PROXIES;
    const actor = actorFromCtx(
      ctx({
        "x-forwarded-for": "6.6.6.6, 198.51.100.23",
        "x-real-ip": "203.0.113.9",
      }),
    );
    expect(actor.ipPrefix).toBe("203.0.113.0/24");
  });

  test("a single X-Forwarded-For value (set by the proxy) is used and truncated", () => {
    delete process.env.TRUSTED_PROXIES;
    expect(
      actorFromCtx(ctx({ "x-forwarded-for": "2001:db8:1:2::5" })).ipPrefix,
    ).toBe("2001:db8:1::/48");
    expect(
      actorFromCtx(ctx({ "x-forwarded-for": "::ffff:192.0.2.1" })).ipPrefix,
    ).toBe("192.0.2.0/24");
  });

  test("no usable address → null", () => {
    delete process.env.TRUSTED_PROXIES;
    expect(actorFromCtx(ctx({})).ipPrefix).toBeNull();
    expect(
      actorFromCtx(ctx({ "x-forwarded-for": "not-an-ip" })).ipPrefix,
    ).toBeNull();
  });
});

describe("actorFromCtx roles", () => {
  test("teacher: name snapshot and IP prefix", () => {
    const actor = actorFromCtx(ctx({ "x-real-ip": "192.0.2.77" }));
    expect(actor).toEqual({
      actorId: "u-admin",
      actorRole: "admin",
      actorName: "Docent",
      impersonatorId: null,
      ipPrefix: "192.0.2.0/24",
    });
  });

  test("student: never a name or IP", () => {
    const actor = actorFromCtx(ctx({ "x-real-ip": "192.0.2.77" }, student));
    expect(actor.actorRole).toBe("student");
    expect(actor.actorName).toBeNull();
    expect(actor.ipPrefix).toBeNull();
  });

  test("no user: system", () => {
    const actor = actorFromCtx(ctx({ "x-real-ip": "192.0.2.77" }, null));
    expect(actor.actorRole).toBe("system");
    expect(actor.actorId).toBeNull();
    expect(actor.ipPrefix).toBeNull();
  });
});
