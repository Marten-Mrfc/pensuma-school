import { describe, expect, test } from "bun:test";
import { isValidCidr, parseCidr } from "@/lib/security/cidr";
import { clientIp } from "./client-ip";

const h = (values: Record<string, string>) => new Headers(values);

describe("clientIp", () => {
  test("single X-Forwarded-For value", () => {
    expect(clientIp(h({ "x-forwarded-for": "203.0.113.7" }), [])).toBe(
      "203.0.113.7",
    );
  });

  test("spoofed multi-hop chain with trusted proxies → right-most untrusted hop", () => {
    const headers = h({
      // client claims to be 1.2.3.4; Traefik (10.0.1.5) appended the real one
      "x-forwarded-for": "1.2.3.4, 198.51.100.23, 10.0.1.5",
      "x-real-ip": "9.9.9.9",
    });
    expect(clientIp(headers, ["10.0.0.0/8"])).toBe("198.51.100.23");
  });

  test("multi-hop chain without trusted proxies falls back to x-real-ip", () => {
    const headers = h({
      "x-forwarded-for": "1.2.3.4, 198.51.100.23",
      "x-real-ip": "198.51.100.23",
    });
    expect(clientIp(headers, [])).toBe("198.51.100.23");
  });

  test("only trusted hops falls back to x-real-ip", () => {
    const headers = h({
      "x-forwarded-for": "10.0.0.2, 10.0.0.3",
      "x-real-ip": "203.0.113.9",
    });
    expect(clientIp(headers, ["10.0.0.0/8"])).toBe("203.0.113.9");
  });

  test("invalid hop stops the walk", () => {
    const headers = h({ "x-forwarded-for": "evil, 10.0.0.3" });
    expect(clientIp(headers, ["10.0.0.0/8"])).toBeNull();
  });

  test("IPv6, ports and IPv4-mapped addresses", () => {
    expect(clientIp(h({ "x-forwarded-for": "2001:DB8::1" }), [])).toBe(
      "2001:db8::1",
    );
    expect(clientIp(h({ "x-forwarded-for": "[2001:db8::1]:443" }), [])).toBe(
      "2001:db8::1",
    );
    expect(clientIp(h({ "x-forwarded-for": "192.0.2.1:8080" }), [])).toBe(
      "192.0.2.1",
    );
    expect(clientIp(h({ "x-forwarded-for": "::ffff:192.0.2.1" }), [])).toBe(
      "192.0.2.1",
    );
    expect(
      clientIp(h({ "x-forwarded-for": "2001:db8::5, fd00::1" }), ["fd00::/8"]),
    ).toBe("2001:db8::5");
  });

  test("no headers → null; garbage → null", () => {
    expect(clientIp(h({}), [])).toBeNull();
    expect(clientIp(h({ "x-forwarded-for": "not-an-ip" }), [])).toBeNull();
    expect(clientIp(h({ "x-real-ip": "999.1.1.1" }), [])).toBeNull();
  });
});

describe("CIDR helpers", () => {
  test("valid and invalid CIDRs", () => {
    for (const v of [
      "10.0.0.0/8",
      "172.18.0.0/16",
      "192.0.2.1",
      "::1",
      "fd00::/8",
    ]) {
      expect(isValidCidr(v)).toBe(true);
    }
    for (const v of [
      "10.0.0.0/33",
      "300.0.0.0/8",
      "abc",
      "fd00::/129",
      "10.0.0.0/x",
    ]) {
      expect(isValidCidr(v)).toBe(false);
    }
    expect(parseCidr("10.1.2.3/8")?.prefix).toBe(8);
  });
});
