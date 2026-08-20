/** Outbound call discipline (KCDX-056).
 *
 *  Deliberately NOT marked `server-only`: this module holds no secrets and calls
 *  no server APIs — it is timers, a counter and a Map. The guard would only make
 *  it untestable, which is how `lib/egress.ts` ended up needing a `-rules` split.
 *
 *  Klimr calls nine third parties — Anthropic, Google Places, Google Geocoding,
 *  Resend, Cloudflare Turnstile, a weather API, and three webhooks (CSAM
 *  scanning, safety escalation, support). Several had no timeout at all, which
 *  on a serverless platform means a vendor that stops answering does not fail:
 *  it holds the invocation until the platform kills it, and every request behind
 *  it queues. A slow dependency becomes an outage of something unrelated.
 *
 *  THREE CONTROLS, and they are not interchangeable:
 *
 *  · TIMEOUT is the one that matters most and is non-negotiable — `callExternal`
 *    cannot be invoked without one, because the type demands it.
 *
 *  · RETRY is only for calls that are safe to repeat. Idempotence is the
 *    caller's promise, not something this module can infer: retrying a Resend
 *    send delivers two emails, retrying a Places lookup costs a fraction of a
 *    cent. So `retries` defaults to 0 and the caller opts in.
 *
 *  · CIRCUIT BREAKER stops hammering a vendor that is already failing, and — more
 *    usefully here — fails fast instead of spending the timeout budget on every
 *    request while an outage lasts.
 *
 *  WHAT THE BREAKER IS AND IS NOT, because a breaker people trust incorrectly is
 *  worse than none. This one is in-process. Serverless instances are ephemeral
 *  and do not share memory, so it protects a warm instance across its own
 *  requests and nothing more: with fifty cold instances you get up to fifty
 *  independent breakers. That is still worth having — most vendor outages are
 *  minutes long and instances stay warm across them — but it is not a global
 *  rate limiter. A shared breaker needs a store, which means a database round
 *  trip on every outbound call, and that trade is not obviously worth it before
 *  there is traffic to measure. Recorded rather than pretended.
 *
 *  · RESPONSE CLASSIFICATION (KFU-021). A vendor that ANSWERS with 429 or 5xx
 *    is failing — but `fetch` resolves, so before this fix every control above
 *    scored it a success: the breaker never learned, retries never spent, and
 *    a rate-limited vendor was hammered at full speed with a clear conscience.
 *    Now a resolved `Response` is classified at the boundary: 429/5xx count as
 *    failures (feeding the breaker, consuming retries, honoring Retry-After up
 *    to a 10s cap); other 4xx pass through untouched — the vendor is healthy
 *    and OUR request is wrong, so the breaker must not learn from it and a
 *    retry would just repeat the mistake. In every case the caller still
 *    receives the final Response and its own `res.ok` handling keeps working:
 *    the controls got smarter, the contract did not move. Non-Response results
 *    (already-parsed JSON etc.) keep resolved-means-success semantics — this
 *    module cannot see inside them. */

type BreakerState = { failures: number; openedAt: number | null };

const breakers = new Map<string, BreakerState>();

const FAILURE_THRESHOLD = 5;   // consecutive failures before the circuit opens
const OPEN_MS = 30_000;        // how long to fail fast before probing again

function breakerFor(vendor: string): BreakerState {
  let b = breakers.get(vendor);
  if (!b) {
    b = { failures: 0, openedAt: null };
    breakers.set(vendor, b);
  }
  return b;
}

/** Exposed for tests and for a future health endpoint. */
export function breakerStatus(vendor: string): { open: boolean; failures: number } {
  const b = breakerFor(vendor);
  const open = b.openedAt !== null && Date.now() - b.openedAt < OPEN_MS;
  return { open, failures: b.failures };
}

export function resetBreaker(vendor: string): void {
  breakers.delete(vendor);
}

export class CircuitOpenError extends Error {
  constructor(vendor: string) {
    super(`circuit open for ${vendor} — failing fast`);
    this.name = "CircuitOpenError";
  }
}

export type ExternalOptions = {
  /** Vendor key for the breaker: "anthropic", "google-places", "resend", … */
  vendor: string;
  /** Hard deadline in ms. Required — there is no sensible default for someone
   *  else's service, and an unstated one is how a call ends up with none. */
  timeoutMs: number;
  /** Only for calls that are SAFE TO REPEAT. Defaults to none. */
  retries?: number;
  /** Base backoff; doubles per attempt, with jitter. */
  backoffMs?: number;
};

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Run one outbound call under timeout, optional retry, and the vendor's breaker.
 *  `work` receives an AbortSignal and MUST pass it to fetch — the timeout is not
 *  magic, it aborts the signal. */
export async function callExternal<T>(
  opts: ExternalOptions,
  work: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const { vendor, timeoutMs, retries = 0, backoffMs = 250 } = opts;
  const b = breakerFor(vendor);

  if (b.openedAt !== null) {
    if (Date.now() - b.openedAt < OPEN_MS) throw new CircuitOpenError(vendor);
    // Half-open: let one request through and see.
    b.openedAt = null;
    b.failures = FAILURE_THRESHOLD - 1;
  }

  let lastErr: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(new Error(`${vendor}: timed out after ${timeoutMs}ms`)), timeoutMs);
    try {
      const result = await work(controller.signal);
      // KFU-021: a resolved Response is not automatically a success.
      if (result instanceof Response && !result.ok) {
        const status = result.status;
        const vendorFailing = status === 429 || (status >= 500 && status <= 599);
        if (vendorFailing) {
          b.failures += 1;
          if (b.failures >= FAILURE_THRESHOLD) b.openedAt = Date.now();
          if (attempt < retries && b.openedAt === null) {
            const ra = Number(result.headers.get("retry-after"));
            const raMs = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 10_000) : null;
            await sleep(raMs ?? backoffMs * 2 ** attempt * (0.5 + Math.random()));
            continue;
          }
          return result; // exhausted — the caller keeps its res.ok contract
        }
        return result; // 4xx: our fault, not the vendor's; the breaker must not learn
      }
      b.failures = 0;
      b.openedAt = null;
      return result;
    } catch (err) {
      lastErr = err;
      b.failures += 1;
      if (b.failures >= FAILURE_THRESHOLD) b.openedAt = Date.now();
      if (attempt < retries && b.openedAt === null) {
        // Jitter matters: without it, every instance that failed together
        // retries together, and the vendor's recovery is met by a thundering herd.
        await sleep(backoffMs * 2 ** attempt * (0.5 + Math.random()));
        continue;
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastErr;
}
