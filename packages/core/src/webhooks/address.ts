/**
 * Classifies IP addresses and hostnames that webhooks must not reach unless private URLs are
 * allowed: loopback, private, link-local, carrier-grade NAT, documentation, multicast and reserved
 * ranges, including IPv4 addresses embedded in IPv6 (mapped, NAT64 and 6to4).
 */

const BLOCKED_IPV4: Array<[number, number]> = [
  [0x00000000, 8], // 0.0.0.0/8 "this network"
  [0x0a000000, 8], // 10.0.0.0/8
  [0x64400000, 10], // 100.64.0.0/10 carrier-grade NAT
  [0x7f000000, 8], // 127.0.0.0/8 loopback
  [0xa9fe0000, 16], // 169.254.0.0/16 link-local (cloud metadata)
  [0xac100000, 12], // 172.16.0.0/12
  [0xc0000000, 24], // 192.0.0.0/24 IETF protocol assignments
  [0xc0000200, 24], // 192.0.2.0/24 TEST-NET-1
  [0xc0a80000, 16], // 192.168.0.0/16
  [0xc6120000, 15], // 198.18.0.0/15 benchmarking
  [0xc6336400, 24], // 198.51.100.0/24 TEST-NET-2
  [0xcb007100, 24], // 203.0.113.0/24 TEST-NET-3
  [0xe0000000, 4], // 224.0.0.0/4 multicast
  [0xf0000000, 4] // 240.0.0.0/4 reserved, including 255.255.255.255
];

function parseIPv4(address: string): number | undefined {
  const parts = address.split('.');
  if (parts.length !== 4) return undefined;
  let value = 0;
  for (const part of parts) {
    if (!/^\d{1,3}$/.test(part) || Number(part) > 255) return undefined;
    value = value * 256 + Number(part);
  }
  return value;
}

function isBlockedIPv4(value: number): boolean {
  return BLOCKED_IPV4.some(([base, bits]) => (value >>> (32 - bits)) === (base >>> (32 - bits)));
}

/** Parses an IPv6 address (without brackets) into eight 16-bit groups. */
function parseIPv6(address: string): number[] | undefined {
  let text = address.toLowerCase();
  const zone = text.indexOf('%');
  if (zone !== -1) text = text.slice(0, zone);
  const lastColon = text.lastIndexOf(':');
  if (text.slice(lastColon + 1).includes('.')) {
    // Rewrite a dotted IPv4 tail (::ffff:1.2.3.4) as two hex groups.
    const v4 = parseIPv4(text.slice(lastColon + 1));
    if (v4 === undefined) return undefined;
    text = `${text.slice(0, lastColon + 1)}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  const halves = text.split('::');
  if (halves.length > 2) return undefined;
  const toGroups = (s: string) => (s === '' ? [] : s.split(':'));
  const head = toGroups(halves[0]);
  const rest = halves.length === 2 ? toGroups(halves[1]) : [];
  if ([...head, ...rest].some((g) => !/^[0-9a-f]{1,4}$/.test(g))) return undefined;
  const explicit = head.length + rest.length;
  if (halves.length === 1 ? explicit !== 8 : explicit > 7) return undefined;
  const zeros = new Array(8 - explicit).fill(0);
  return [...head.map((g) => parseInt(g, 16)), ...zeros, ...rest.map((g) => parseInt(g, 16))];
}

function isBlockedIPv6(g: number[]): boolean {
  const embedded = (hi: number, lo: number) => isBlockedIPv4(((hi << 16) | lo) >>> 0);
  if (g.slice(0, 6).every((x) => x === 0)) return true; // ::, ::1 and IPv4-compatible ::a.b.c.d
  if (g.slice(0, 5).every((x) => x === 0) && g[5] === 0xffff) return embedded(g[6], g[7]); // ::ffff:a.b.c.d
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return embedded(g[6], g[7]); // NAT64
  if (g[0] === 0x2002) return embedded(g[1], g[2]); // 6to4
  if (g[0] === 0x0100 && g.slice(1, 4).every((x) => x === 0)) return true; // 100::/64 discard
  if ((g[0] & 0xfe00) === 0xfc00) return true; // fc00::/7 unique local
  if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0) return true; // link-local, site-local
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  if (g[0] === 0x2001 && g[1] === 0x0db8) return true; // documentation
  return false;
}

/** True if `address` is an IP literal in a range webhooks may not target. Non-IP input returns false. */
export function isPrivateAddress(address: string): boolean {
  const unbracketed = address.startsWith('[') && address.endsWith(']') ? address.slice(1, -1) : address;
  const v4 = parseIPv4(unbracketed);
  if (v4 !== undefined) return isBlockedIPv4(v4);
  const v6 = unbracketed.includes(':') ? parseIPv6(unbracketed) : undefined;
  return v6 ? isBlockedIPv6(v6) : false;
}

/** True if a URL hostname is an IP literal (IPv6 in brackets, as `URL.hostname` returns it). */
export function isIpLiteral(hostname: string): boolean {
  return parseIPv4(hostname) !== undefined || (hostname.startsWith('[') && hostname.endsWith(']'));
}

/** True if a URL hostname is a private IP literal or a local-only name such as `localhost`. */
export function isPrivateHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/\.$/, '');
  if (isIpLiteral(host)) return isPrivateAddress(host);
  return host === 'localhost' || /\.(localhost|internal|local)$/.test(host);
}

/** Resolves a hostname to its IP addresses. */
export type HostResolver = (hostname: string) => Promise<string[]>;

/** `node:dns` lookup where available (Node, Bun, Deno); `undefined` on runtimes without DNS access. */
export function defaultHostResolver(): HostResolver | undefined {
  const dns = (globalThis as any).process?.getBuiltinModule?.('node:dns') as typeof import('node:dns') | undefined;
  if (!dns?.promises?.lookup) return undefined;
  return async (hostname) => (await dns.promises.lookup(hostname, { all: true, verbatim: true })).map((r) => r.address);
}
