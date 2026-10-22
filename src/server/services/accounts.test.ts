/** Pure parts of the account helpers (no database needed). */
import { describe, expect, test } from "bun:test";
import { createCipheriv, createHash, randomBytes } from "node:crypto";
import { decryptPin, encryptPin, generatePin } from "./accounts";

const WEAK = new Set([
  "000000",
  "111111",
  "123456",
  "654321",
  "123123",
  "112233",
]);

describe("generatePin", () => {
  test("10 000 PINs: 6 digits, never weak or one repeated digit", () => {
    const seen = new Set<string>();
    let leadingZero = 0;
    for (let i = 0; i < 10_000; i++) {
      const pin = generatePin();
      expect(pin).toMatch(/^\d{6}$/);
      expect(WEAK.has(pin)).toBe(false);
      expect(/^(\d)\1{5}$/.test(pin)).toBe(false);
      if (pin.startsWith("0")) leadingZero++;
      seen.add(pin);
    }
    // Uniform over 000000–999999: leading zeros happen (~10%) and
    // collisions are rare (~50 expected in 10 000 draws).
    expect(leadingZero).toBeGreaterThan(500);
    expect(seen.size).toBeGreaterThan(9_800);
  });
});

describe("encryptPin / decryptPin", () => {
  test("round-trip", () => {
    for (const pin of ["739838", "000417", "999999"]) {
      expect(decryptPin(encryptPin(pin))).toBe(pin);
    }
  });

  test("a random IV makes every ciphertext different", () => {
    const a = encryptPin("739838");
    const b = encryptPin("739838");
    expect(a).not.toBe(b);
    expect(a.split(".")).toHaveLength(3);
    expect(a).not.toContain("739838");
  });

  test("tampering gives null", () => {
    const payload = encryptPin("739838");
    const [iv, tag, enc] = payload.split(".");
    const flip = (s: string) => {
      const buf = Buffer.from(s, "base64url");
      buf[0] ^= 0xff;
      return buf.toString("base64url");
    };
    expect(decryptPin(`${iv}.${tag}.${flip(enc)}`)).toBeNull();
    expect(decryptPin(`${iv}.${flip(tag)}.${enc}`)).toBeNull();
    expect(decryptPin(`${flip(iv)}.${tag}.${enc}`)).toBeNull();
    expect(decryptPin("garbage")).toBeNull();
    expect(decryptPin("")).toBeNull();
    expect(decryptPin("a.b")).toBeNull();
  });

  test("a payload made with another secret gives null", () => {
    const key = createHash("sha256")
      .update("another-secret-another-secret-xx:student-pin")
      .digest();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", key, iv);
    const enc = Buffer.concat([
      cipher.update("739838", "utf8"),
      cipher.final(),
    ]);
    const foreign = [iv, cipher.getAuthTag(), enc]
      .map((b) => b.toString("base64url"))
      .join(".");
    expect(decryptPin(foreign)).toBeNull();
  });
});
