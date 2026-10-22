/**
 * The client's IP address behind a reverse proxy (Traefik in Dokploy).
 *
 * The left-most X-Forwarded-For entry is set by the client and can be
 * spoofed. With TRUSTED_PROXIES the chain is walked from the right and
 * trusted hops are skipped; the first untrusted hop is the client. Without
 * TRUSTED_PROXIES only a single-value X-Forwarded-For is believed (Traefik
 * overwrites the header with the address it saw), otherwise X-Real-IP.
 * Same rules as better-auth's `advanced.ipAddress.trustedProxies`.
 *
 * TRUSTED_PROXIES is read from process.env (validated in src/env.ts), so
 * this module stays importable from unit tests without the full env.
 */
import {
  type Cidr,
  cidrContains,
  ipToBytes,
  parseCidr,
  splitList,
} from "@/lib/security/cidr";

type HeaderSource = { get(name: string): string | null };

let cachedRaw: string | undefined;
let cachedList: readonly string[] = [];

/** TRUSTED_PROXIES from the environment, parsed once per value. */
export function trustedProxiesFromEnv(): readonly string[] {
  const raw = process.env.TRUSTED_PROXIES ?? "";
  if (raw !== cachedRaw) {
    cachedRaw = raw;
    cachedList = splitList(raw);
  }
  return cachedList;
}

/** "[2001:db8::1]:443" → "2001:db8::1"; "192.0.2.1:8080" → "192.0.2.1". */
function stripPort(value: string): string {
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value);
  if (bracketed) return bracketed[1];
  const v4 = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(value);
  if (v4) return v4[1];
  return value;
}

/** A canonical-ish address string, or null when it is not an IP. */
function cleanIp(value: string | undefined): string | null {
  if (!value) return null;
  const ip = stripPort(value.trim());
  const bytes = ipToBytes(ip);
  if (!bytes) return null;
  // IPv4-mapped IPv6 → plain IPv4, so buckets and prefixes line up.
  return bytes.length === 4 ? Array.from(bytes).join(".") : ip.toLowerCase();
}

export function clientIp(
  headers: HeaderSource,
  trustedProxies: readonly string[] = trustedProxiesFromEnv(),
): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);
    const nets = trustedProxies
      .map(parseCidr)
      .filter((n): n is Cidr => n !== null);
    if (nets.length > 0) {
      for (let i = hops.length - 1; i >= 0; i--) {
        const ip = cleanIp(hops[i]);
        if (!ip) break;
        const bytes = ipToBytes(ip);
        if (bytes && nets.some((net) => cidrContains(net, bytes))) continue;
        return ip;
      }
    } else if (hops.length === 1) {
      const ip = cleanIp(hops[0]);
      if (ip) return ip;
    }
  }
  return cleanIp(headers.get("x-real-ip") ?? undefined);
}
