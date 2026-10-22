import { describe, expect, test } from "bun:test";
import { enforceBodyLimit, isCrossSiteMutation } from "./request-guards";

const APP = "https://toetsen.school.nl";
const prod = { appOrigin: APP, dev: false };
const dev = { appOrigin: "http://localhost:3000", dev: true };

function post(headers: Record<string, string>, method = "POST") {
  return new Request(`${APP}/api/trpc/class.update`, {
    method,
    headers,
    body: method === "GET" ? undefined : "{}",
  });
}

describe("isCrossSiteMutation", () => {
  test("same origin passes", () => {
    expect(isCrossSiteMutation(post({ origin: APP }), prod)).toBe(false);
    expect(
      isCrossSiteMutation(
        post({ origin: APP, "sec-fetch-site": "same-origin" }),
        prod,
      ),
    ).toBe(false);
  });

  test("another origin is blocked", () => {
    expect(
      isCrossSiteMutation(post({ origin: "https://evil.example" }), prod),
    ).toBe(true);
    expect(isCrossSiteMutation(post({ origin: "null" }), prod)).toBe(true);
    expect(
      isCrossSiteMutation(post({ origin: "http://toetsen.school.nl" }), prod),
    ).toBe(true);
  });

  test("Sec-Fetch-Site cross-site or same-site is blocked", () => {
    expect(
      isCrossSiteMutation(post({ "sec-fetch-site": "cross-site" }), prod),
    ).toBe(true);
    // A sibling subdomain (www.school.nl) is same-site but not same-origin.
    expect(
      isCrossSiteMutation(
        post({ origin: APP, "sec-fetch-site": "same-site" }),
        prod,
      ),
    ).toBe(true);
  });

  test("non-browser clients without Origin pass", () => {
    expect(isCrossSiteMutation(post({}), prod)).toBe(false);
    expect(isCrossSiteMutation(post({ "sec-fetch-site": "none" }), prod)).toBe(
      false,
    );
  });

  test("GET is never a mutation", () => {
    expect(
      isCrossSiteMutation(
        post({ origin: "https://evil.example" }, "GET"),
        prod,
      ),
    ).toBe(false);
  });

  test("development allows any localhost port, production does not", () => {
    expect(
      isCrossSiteMutation(post({ origin: "http://localhost:3100" }), dev),
    ).toBe(false);
    expect(
      isCrossSiteMutation(post({ origin: "http://127.0.0.1:3111" }), dev),
    ).toBe(false);
    expect(
      isCrossSiteMutation(post({ origin: "http://localhost:3100" }), prod),
    ).toBe(true);
    expect(
      isCrossSiteMutation(post({ origin: "http://localhost.evil.nl" }), dev),
    ).toBe(true);
  });
});

describe("enforceBodyLimit", () => {
  test("Content-Length within the cap passes the original request", async () => {
    const req = new Request(APP, {
      method: "POST",
      body: "x".repeat(10),
      headers: { "content-length": "10" },
    });
    const result = await enforceBodyLimit(req, 100);
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.request).toBe(req);
  });

  test("Content-Length over the cap is rejected without reading", async () => {
    const req = new Request(APP, {
      method: "POST",
      body: "x",
      headers: { "content-length": String(7 * 1024 * 1024) },
    });
    expect((await enforceBodyLimit(req, 6 * 1024 * 1024)).ok).toBe(false);
  });

  test("invalid Content-Length is rejected", async () => {
    const req = new Request(APP, {
      method: "POST",
      body: "x",
      headers: { "content-length": "abc" },
    });
    expect((await enforceBodyLimit(req, 100)).ok).toBe(false);
  });

  function streamOf(size: number, chunk = 1024) {
    let sent = 0;
    return new ReadableStream<Uint8Array>({
      pull(controller) {
        if (sent >= size) {
          controller.close();
          return;
        }
        const n = Math.min(chunk, size - sent);
        sent += n;
        controller.enqueue(new Uint8Array(n).fill(120));
      },
    });
  }

  test("a stream without Content-Length is read up to the cap", async () => {
    const big = new Request(APP, {
      method: "POST",
      body: streamOf(5000),
      // @ts-expect-error Node/Bun need duplex for streaming bodies
      duplex: "half",
    });
    big.headers.delete("content-length");
    expect((await enforceBodyLimit(big, 4096)).ok).toBe(false);

    const small = new Request(APP, {
      method: "POST",
      body: streamOf(3000),
      // @ts-expect-error Node/Bun need duplex for streaming bodies
      duplex: "half",
    });
    small.headers.delete("content-length");
    const result = await enforceBodyLimit(small, 4096);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect((await result.request.arrayBuffer()).byteLength).toBe(3000);
      expect(result.request.url).toBe(`${APP}/`);
    }
  });

  test("no body passes", async () => {
    const req = new Request(APP, { method: "GET" });
    expect((await enforceBodyLimit(req, 10)).ok).toBe(true);
  });
});
