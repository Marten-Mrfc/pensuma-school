/**
 * IP address and CIDR helpers (IPv4 and IPv6). Pure module, shared by the
 * env validation (TRUSTED_PROXIES) and the client-IP resolution.
 */

function parseIpv4(value: string): number[] | null {
  const parts = value.split(".");
  if (parts.length !== 4) return null;
  const out: number[] = [];
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part)) return null;
    const n = Number(part);
    if (n > 255) return null;
    out.push(n);
  }
  return out;
}

function parseIpv6(input: string): number[] | null {
  let value = input.toLowerCase();
  // Embedded IPv4 tail, e.g. "::ffff:192.0.2.1".
  const lastColon = value.lastIndexOf(":");
  const tail = value.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIpv4(tail);
    if (!v4) return null;
    value = `${value.slice(0, lastColon + 1)}${((v4[0] << 8) | v4[1]).toString(16)}:${((v4[2] << 8) | v4[3]).toString(16)}`;
  }
  const halves = value.split("::");
  if (halves.length > 2) return null;
  const parse = (chunk: string): number[] | null => {
    if (chunk === "") return [];
    const out: number[] = [];
    for (const h of chunk.split(":")) {
      if (!/^[0-9a-f]{1,4}$/.test(h)) return null;
      out.push(Number.parseInt(h, 16));
    }
    return out;
  };
  const head = parse(halves[0] ?? "");
  const rest = halves.length === 2 ? parse(halves[1] ?? "") : [];
  if (!head || !rest) return null;
  if (halves.length === 1) return head.length === 8 ? head : null;
  const missing = 8 - head.length - rest.length;
  if (missing < 1) return null;
  return [...head, ...new Array<number>(missing).fill(0), ...rest];
}

/**
 * Raw bytes of an IP address (4 for IPv4, 16 for IPv6). IPv4-mapped IPv6
 * ("::ffff:192.0.2.1") becomes the IPv4 bytes. Null when invalid.
 */
export function ipToBytes(ip: string): Uint8Array | null {
  const value = ip.trim();
  if (!value || value.length > 64) return null;
  if (!value.includes(":")) {
    const v4 = parseIpv4(value);
    return v4 ? Uint8Array.from(v4) : null;
  }
  const hextets = parseIpv6(value.replace(/%.*$/, ""));
  if (!hextets) return null;
  const mapped =
    hextets.slice(0, 5).every((h) => h === 0) && hextets[5] === 0xffff;
  if (mapped) {
    return Uint8Array.from([
      hextets[6] >> 8,
      hextets[6] & 0xff,
      hextets[7] >> 8,
      hextets[7] & 0xff,
    ]);
  }
  const bytes = new Uint8Array(16);
  hextets.forEach((h, i) => {
    bytes[i * 2] = h >> 8;
    bytes[i * 2 + 1] = h & 0xff;
  });
  return bytes;
}

export function isValidIp(ip: string): boolean {
  return ipToBytes(ip) !== null;
}

export type Cidr = { bytes: Uint8Array; prefix: number };

/** "10.0.0.0/8", "2001:db8::/32" or a single address. Null when invalid. */
export function parseCidr(value: string): Cidr | null {
  const trimmed = value.trim();
  const slash = trimmed.lastIndexOf("/");
  const bytes = ipToBytes(slash === -1 ? trimmed : trimmed.slice(0, slash));
  if (!bytes) return null;
  const max = bytes.length * 8;
  if (slash === -1) return { bytes, prefix: max };
  const prefixPart = trimmed.slice(slash + 1);
  if (!/^\d{1,3}$/.test(prefixPart)) return null;
  const prefix = Number(prefixPart);
  return prefix <= max ? { bytes, prefix } : null;
}

export function isValidCidr(value: string): boolean {
  return parseCidr(value) !== null;
}

export function cidrContains(net: Cidr, ip: Uint8Array): boolean {
  if (net.bytes.length !== ip.length) return false;
  let bits = net.prefix;
  for (let i = 0; i < ip.length && bits > 0; i++) {
    const take = Math.min(8, bits);
    const mask = (0xff << (8 - take)) & 0xff;
    if ((ip[i] & mask) !== (net.bytes[i] & mask)) return false;
    bits -= take;
  }
  return true;
}

/** Comma-separated list → trimmed, non-empty entries. */
export function splitList(value: string | null | undefined): string[] {
  return (value ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
