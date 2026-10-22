/**
 * Sign in through the HTTP API and turn the session cookies into a
 * Playwright storage state (written by hand, so `__Secure-` cookies of a
 * production build on http://localhost survive as well).
 */
export type StorageState = {
  cookies: {
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: "Strict" | "Lax" | "None";
  }[];
  origins: {
    origin: string;
    localStorage: { name: string; value: string }[];
  }[];
};

type ParsedCookie = StorageState["cookies"][number];

export function parseSetCookie(header: string, host: string): ParsedCookie {
  const [pair, ...attrs] = header.split(";").map((s) => s.trim());
  const eq = pair.indexOf("=");
  const cookie: ParsedCookie = {
    name: pair.slice(0, eq),
    value: pair.slice(eq + 1),
    domain: host,
    path: "/",
    expires: -1,
    httpOnly: false,
    secure: false,
    sameSite: "Lax",
  };
  for (const attr of attrs) {
    const [rawKey, ...rest] = attr.split("=");
    const key = rawKey.toLowerCase();
    const value = rest.join("=");
    if (key === "path") cookie.path = value || "/";
    else if (key === "httponly") cookie.httpOnly = true;
    else if (key === "secure") cookie.secure = true;
    else if (key === "max-age") {
      cookie.expires = Math.floor(Date.now() / 1000) + Number(value);
    } else if (key === "expires" && cookie.expires === -1) {
      const t = Date.parse(value);
      if (!Number.isNaN(t)) cookie.expires = Math.floor(t / 1000);
    } else if (key === "samesite") {
      const v = value.toLowerCase();
      cookie.sameSite =
        v === "strict" ? "Strict" : v === "none" ? "None" : "Lax";
    }
  }
  return cookie;
}

/** POST a better-auth sign-in and return the storage state of the session. */
export async function signInState(
  baseURL: string,
  path: string,
  body: Record<string, string>,
): Promise<StorageState> {
  const origin = new URL(baseURL).origin;
  const res = await fetch(`${baseURL}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", origin },
    body: JSON.stringify(body),
    redirect: "manual",
  });
  if (!res.ok) {
    throw new Error(
      `[e2e] Sign-in ${path} failed with ${res.status}: ${(await res.text()).slice(0, 300)}`,
    );
  }
  const host = new URL(baseURL).hostname;
  const cookies = res.headers
    .getSetCookie()
    .map((h) => parseSetCookie(h, host))
    .filter((c) => c.value !== "");
  if (!cookies.some((c) => c.name.includes("session_token"))) {
    throw new Error(`[e2e] Sign-in ${path} returned no session cookie`);
  }
  return { cookies, origins: [] };
}

/** The Cookie header for API requests made with a storage state. */
export function cookieHeader(state: StorageState): string {
  return state.cookies.map((c) => `${c.name}=${c.value}`).join("; ");
}
