/** Egress address classification (KCDX-019) — pure, so it can be tested without
 *  a server runtime. `lib/egress.ts` holds the part that actually opens sockets.
 *
 *  The question this answers: wherever a hostname points, is that address on the
 *  public internet? It runs inside the DNS lookup the socket itself uses, which
 *  is what makes DNS rebinding a non-event rather than a race. */
import { isIP } from "node:net";

// Blocked IPv4 space, as [network, prefix-length] pairs.
const V4_BLOCKED: [string, number][] = [
  ["0.0.0.0", 8],        // "this network"
  ["10.0.0.0", 8],       // RFC1918
  ["100.64.0.0", 10],    // CGNAT — a real private range on many hosts
  ["127.0.0.0", 8],      // loopback
  ["169.254.0.0", 16],   // link-local — cloud metadata lives here
  ["172.16.0.0", 12],    // RFC1918
  ["192.0.0.0", 24],     // IETF protocol assignments
  ["192.0.2.0", 24],     // TEST-NET-1
  ["192.88.99.0", 24],   // 6to4 relay anycast
  ["192.168.0.0", 16],   // RFC1918
  ["198.18.0.0", 15],    // benchmarking
  ["198.51.100.0", 24],  // TEST-NET-2
  ["203.0.113.0", 24],   // TEST-NET-3
  ["224.0.0.0", 4],      // multicast
  ["240.0.0.0", 4],      // reserved, includes 255.255.255.255
];

const v4ToInt = (ip: string): number | null => {
  const parts = ip.split(".");
  if (parts.length !== 4) return null;
  let n = 0;
  for (const p of parts) {
    if (!/^\d{1,3}$/.test(p)) return null;
    const v = Number(p);
    if (v > 255) return null;
    n = (n << 8) | v;
  }
  return n >>> 0;
};

/** True if this literal address must never be connected to. Unparseable input is
 *  blocked: an address we cannot classify is not one we should dial. */
export function isBlockedAddress(addr: string): boolean {
  const ip = addr.trim().toLowerCase().replace(/^\[|\]$/g, "").replace(/%.*$/, "");
  const kind = isIP(ip);

  if (kind === 4) {
    const n = v4ToInt(ip);
    if (n === null) return true;
    for (const [net, bits] of V4_BLOCKED) {
      const base = v4ToInt(net)!;
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0;
      if ((n & mask) === (base & mask)) return true;
    }
    return false;
  }

  if (kind === 6) {
    // IPv4-mapped (::ffff:1.2.3.4) and NAT64 (64:ff9b::/96) carry a v4 address —
    // classify by the address that will actually be reached.
    const embedded = ip.match(/(\d{1,3}(?:\.\d{1,3}){3})$/);
    if (embedded && (ip.startsWith("::ffff:") || ip.startsWith("64:ff9b:") || ip.startsWith("::"))) {
      return isBlockedAddress(embedded[1]);
    }
    if (ip === "::" || ip === "::1") return true;
    if (/^f[cd]/.test(ip)) return true;              // fc00::/7 unique-local
    if (/^fe[89ab]/.test(ip)) return true;           // fe80::/10 link-local
    if (/^ff/.test(ip)) return true;                 // ff00::/8 multicast
    if (ip.startsWith("2001:db8:")) return true;     // documentation
    return false;
  }

  return true; // not an IP literal at all
}
