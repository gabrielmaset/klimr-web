import "server-only";
import { lookup as dnsLookup, type LookupAddress } from "node:dns";
import { isBlockedAddress } from "@/lib/egress-rules";
import https from "node:https";

/** Outbound egress control (KCDX-019, and the timeout half of KCDX-056).
 *
 *  WHY THIS EXISTS IN CODE RATHER THAN IN THE NETWORK. The audit asks for
 *  infrastructure egress filtering, and it is right to. We cannot buy it:
 *  Vercel's egress policy controls (Secure Compute with VPC peering; the Sandbox
 *  SNI/CIDR policies) are Enterprise-only. Static IPs on Pro are the opposite
 *  feature — fixed outbound addresses so that OTHERS can allowlist us — and do
 *  not restrict where we may connect.
 *
 *  So it is enforced here, at the one moment that actually decides: the DNS
 *  resolution that precedes the TCP connect. For the specific threat this is
 *  arguably better than a CIDR ACL, because it validates the exact address the
 *  socket will use. That is what closes DNS rebinding — a hostname that passes an
 *  allowlist check and then resolves to 169.254.169.254 a moment later has
 *  nothing to rebind to, because the address is validated inside the lookup that
 *  the connection itself uses, not in a separate check beforehand.
 *
 *  Two layers, and they answer different questions:
 *    · the caller's allowlist  — "is this a host we have any business calling?"
 *    · this module             — "wherever that name points, is it on the public
 *                                 internet?"
 *  Neither replaces the other. A compromised or hijacked allowlisted domain gets
 *  past the first and is stopped by the second.
 */

/** A dns.lookup that refuses to hand back an address we must not connect to.
 *  Every resolved address is checked, not just the first — a name that answers
 *  with one public and one private address must not be reachable by luck. */
function guardedLookup(
  hostname: string,
  options: { family?: number; all?: boolean; hints?: number },
  // Node's callback is overloaded on `options.all`; the loose type is deliberate.
  callback: (err: NodeJS.ErrnoException | null, address?: string | LookupAddress[], family?: number) => void,
): void {
  dnsLookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err);
    const list = (Array.isArray(addresses) ? addresses : [addresses]) as LookupAddress[];
    if (!list.length) return callback(Object.assign(new Error(`egress: ${hostname} did not resolve`), { code: "ENOTFOUND" }));
    for (const a of list) {
      if (isBlockedAddress(a.address)) {
        return callback(
          Object.assign(new Error(`egress refused: ${hostname} resolves to a non-public address (${a.address})`), {
            code: "EGRESSBLOCKED",
          }),
        );
      }
    }
    if (options.all) return callback(null, list);
    return callback(null, list[0].address, list[0].family);
  });
}

export type SafeResponse = {
  status: number;
  headers: { get(name: string): string | null };
  text(): Promise<string>;
};

/** GET a URL with egress control and a hard timeout. Redirects are NEVER
 *  followed here — the caller walks the chain so that every hop goes back
 *  through its own allowlist. That is the KCDX-019 lesson: a client that follows
 *  redirects for you has taken the decision away from the code that knows which
 *  hosts are legitimate. */
export async function safeGet(
  url: string,
  opts: { headers?: Record<string, string>; timeoutMs?: number; maxBytes?: number; signal?: AbortSignal } = {},
): Promise<SafeResponse> {
  const { headers = {}, timeoutMs = 6500, maxBytes = 300_000, signal } = opts;
  // KFU-022: an external signal aborts the in-flight request. Without this,
  // every caller-side AbortController governing a multi-hop walk was
  // decorative — the hop it "cancelled" ran to its own timeout regardless.
  if (signal?.aborted) throw new Error("egress: aborted before start");
  const u = new URL(url);
  if (u.protocol !== "https:") throw new Error("egress refused: only https is permitted");

  return new Promise<SafeResponse>((resolve, reject) => {
    const req = https.request(
      {
        protocol: u.protocol,
        hostname: u.hostname,
        port: u.port || 443,
        path: `${u.pathname}${u.search}`,
        method: "GET",
        headers: { host: u.host, ...headers },
        lookup: guardedLookup as never,
        timeout: timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;
        res.on("data", (c: Buffer) => {
          size += c.length;
          if (size <= maxBytes) chunks.push(c);
          else res.destroy(); // stop reading; what we have is enough
        });
        res.on("end", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: { get: (n) => (res.headers[n.toLowerCase()] as string | undefined) ?? null },
            text: async () => Buffer.concat(chunks).toString("utf8"),
          }),
        );
        res.on("error", reject);
        res.on("aborted", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: { get: (n) => (res.headers[n.toLowerCase()] as string | undefined) ?? null },
            text: async () => Buffer.concat(chunks).toString("utf8"),
          }),
        );
      },
    );
    req.on("timeout", () => req.destroy(new Error(`egress: timed out after ${timeoutMs}ms`)));
    const onAbort = () => req.destroy(new Error("egress: aborted"));
    signal?.addEventListener("abort", onAbort, { once: true });
    req.on("close", () => signal?.removeEventListener("abort", onAbort));
    req.on("error", reject);
    req.end();
  });
}
