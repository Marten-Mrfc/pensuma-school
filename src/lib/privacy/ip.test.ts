import { describe, expect, test } from "bun:test";
import { clientIpFromHeaders, truncateIp } from "./ip";

describe("truncateIp", () => {
  test("IPv4 → /24", () => {
    expect(truncateIp("192.0.2.123")).toBe("192.0.2.0/24");
    expect(truncateIp(" 10.1.2.3 ")).toBe("10.1.2.0/24");
    expect(truncateIp("192.0.2.1:8080")).toBe("192.0.2.0/24");
  });

  test("IPv6 → first three hextets /48", () => {
    expect(truncateIp("2001:db8:1:2::5")).toBe("2001:db8:1::/48");
    expect(truncateIp("2001:0DB8:0001:0002:0003:0004:0005:0006")).toBe(
      "2001:db8:1::/48",
    );
    // "::" expands before taking the prefix.
    expect(truncateIp("2001:db8::1")).toBe("2001:db8:0::/48");
    expect(truncateIp("::1")).toBe("0:0:0::/48");
    expect(truncateIp("fe80::1%eth0")).toBe("fe80:0:0::/48");
    expect(truncateIp("[2001:db8:5::1]:443")).toBe("2001:db8:5::/48");
  });

  test("IPv4-mapped IPv6 follows the IPv4 rule", () => {
    expect(truncateIp("::ffff:192.0.2.77")).toBe("192.0.2.0/24");
    expect(truncateIp("::FFFF:c000:0201")).toBe("192.0.2.0/24");
  });

  test("invalid input → null", () => {
    for (const bad of [
      "",
      "   ",
      "unknown",
      "256.1.1.1",
      "1.2.3",
      "1.2.3.4.5",
      "1.2.3.-4",
      "2001:db8:::1",
      "1::2::3",
      "12345::1",
      "1:2:3:4:5:6:7:8:9",
      "1:2:3:4:5:6:7",
      "::ffff:999.1.1.1",
      "g::1",
    ]) {
      expect(truncateIp(bad)).toBeNull();
    }
    expect(truncateIp(null)).toBeNull();
    expect(truncateIp(undefined)).toBeNull();
  });
});

describe("clientIpFromHeaders", () => {
  test("first X-Forwarded-For entry wins", () => {
    const h = new Headers({
      "x-forwarded-for": " 203.0.113.9 , 10.0.0.1",
      "x-real-ip": "10.0.0.2",
    });
    expect(clientIpFromHeaders(h)).toBe("203.0.113.9");
  });

  test("falls back to X-Real-IP, then null", () => {
    expect(clientIpFromHeaders(new Headers({ "x-real-ip": "10.0.0.2" }))).toBe(
      "10.0.0.2",
    );
    expect(clientIpFromHeaders(new Headers({ "x-forwarded-for": " " }))).toBe(
      null,
    );
    expect(clientIpFromHeaders(new Headers())).toBeNull();
  });
});
