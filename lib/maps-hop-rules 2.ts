/** The Maps redirect-chain host allowlist (KCDX-019) — pure, so it can be
 *  tested without a server runtime. See lib/egress-rules.ts for the companion
 *  question about where a permitted name actually resolves. */
const SHORT_HOSTS = new Set(["goo.gl", "maps.app.goo.gl", "app.goo.gl", "g.co"]);

// Hosts the redirect chain is allowed to traverse: the short-link hosts above,
// plus Google's own Maps/consent domains that the chain legitimately lands on.
const GOOGLE_HOST_RE = /^(?:(?:www|maps|consent)\.)?google\.(?:com|[a-z]{2}|com\.[a-z]{2}|co\.[a-z]{2})$/i;

/** KCDX-019: may we fetch this URL?
 *
 *  The resolver checks the URL it is GIVEN and then follows redirects. Every hop
 *  after the first was fetched without any check at all, so a permitted short
 *  link that answers `302 Location: http://169.254.169.254/latest/meta-data/`
 *  turned our server into the attacker's HTTP client against our own network.
 *  The audit demonstrated exactly that with a mocked fetch; the only reason it
 *  is constrained in practice is that you need a usable allowlisted redirect.
 *
 *  So: this runs before EVERY fetch, not just the first. It is an allowlist —
 *  a blocklist of private ranges is the wrong shape here, because nothing but
 *  Google should ever be reachable from this code path, and enumerating "not
 *  Google" is impossible.
 *
 *  Still owed at the infrastructure layer (KCDX-019 names it as a dependency):
 *  egress filtering, so that a bug here cannot reach link-local or RFC1918
 *  addresses regardless of what this function believes. DNS rebinding — a
 *  permitted hostname resolving to a private address between check and connect —
 *  is not defensible in application code and needs that control. */
export function isPermittedMapsHop(raw: string): boolean {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;          // no http, no file:, no gopher:
  if (url.username || url.password) return false;        // https://google.com@evil.example
  if (url.port && url.port !== "443") return false;
  const host = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host.includes(":")) return false;                  // IPv6 literal
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host)) return false;  // IPv4 literal
  if (/^\d+$/.test(host.replace(/\./g, ""))) return false;    // decimal/octal IP forms
  if (SHORT_HOSTS.has(host.replace(/^www\./, ""))) return true;
  return GOOGLE_HOST_RE.test(host);
}
