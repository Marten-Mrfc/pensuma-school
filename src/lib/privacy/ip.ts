/**
 * IP address minimisation for the audit log: only a network prefix is
 * stored (/24 for IPv4, /48 for IPv6), never the full address.
 * Pure module.
 */

type HeaderSource = { get(name: string): string | null };

function parseIpv4(value: string): number[] | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const octets: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    octets.push(n);
  }
  return octets;
}

/** Expands an IPv6 address to 8 numeric hextets, or null when invalid. */
function parseIpv6(value: string): number[] | null {
  let address = value;
  // Embedded IPv4 in the last 32 bits, e.g. "::ffff:192.0.2.1": rewrite it
  // as two hextets first.
  const lastColon = address.lastIndexOf(":");
  const tail = address.slice(lastColon + 1);
  if (tail.includes(".")) {
    const octets = parseIpv4(tail);
    if (!octets) return null;
    const high = ((octets[0] << 8) | octets[1]).toString(16);
    const low = ((octets[2] << 8) | octets[3]).toString(16);
    address = `${address.slice(0, lastColon + 1)}${high}:${low}`;
  }

  const halves = address.split("::");
  if (halves.length > 2) return null;
  const parse = (chunk: string): number[] | null => {
    if (chunk === "") return [];
    const out: number[] = [];
    for (const h of chunk.split(":")) {
      if (!/^[0-9a-f]{1,4}$/i.test(h)) return null;
      out.push(Number.parseInt(h, 16));
    }
    return out;
  };
  const head = parse(halves[0]);
  const rest = halves.length === 2 ? parse(halves[1]) : [];
  if (!head || !rest) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const missing = 8 - head.length - rest.length;
  if (missing < 1) return null;
  return [...head, ...new Array<number>(missing).fill(0), ...rest];
}

/**
 * "192.0.2.123" → "192.0.2.0/24"; "2001:db8:1:2::5" → "2001:db8:1::/48";
 * IPv4-mapped IPv6 ("::ffff:192.0.2.1") follows the IPv4 rule.
 * Invalid input → null.
 */
export function truncateIp(ip: string | null | undefined): string | null {
  if (typeof ip !== "string") return null;
  let value = ip.trim();
  if (!value || value.length > 100) return null;

  // "[2001:db8::1]:443" → "2001:db8::1"
  const bracketed = /^\[([^\]]+)\](?::\d+)?$/.exec(value);
  if (bracketed) value = bracketed[1];
  // "192.0.2.1:8080" → "192.0.2.1"
  const withPort = /^(\d{1,3}(?:\.\d{1,3}){3}):\d+$/.exec(value);
  if (withPort) value = withPort[1];
  // Zone id: "fe80::1%eth0"
  value = value.replace(/%.*$/, "");

  if (!value.includes(":")) {
    const octets = parseIpv4(value);
    return octets ? `${octets[0]}.${octets[1]}.${octets[2]}.0/24` : null;
  }

  const hextets = parseIpv6(value);
  if (!hextets) return null;
  const isMapped =
    hextets.slice(0, 5).every((h) => h === 0) && hextets[5] === 0xffff;
  if (isMapped) {
    return `${hextets[6] >> 8}.${hextets[6] & 0xff}.${hextets[7] >> 8}.0/24`;
  }
  return `${hextets
    .slice(0, 3)
    .map((h) => h.toString(16))
    .join(":")}::/48`;
}

/** The client IP as reported by the reverse proxy (first X-Forwarded-For). */
export function clientIpFromHeaders(headers: HeaderSource): string | null {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = headers.get("x-real-ip")?.trim();
  return realIp || null;
}
