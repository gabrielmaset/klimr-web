/** In-process sliding-window bucket — the SECONDARY limiter behind
 *  rateLimitStrict (audit SEC-007 · O-4 · K1-02). Pure and injectable-clock
 *  for tests. Per-instance by nature (serverless): it cannot replace the DB
 *  limiter, but it keeps cost-bearing endpoints bounded when the DB limiter
 *  errors instead of silently failing open. */
const buckets = new Map<string, number[]>();
let ops = 0;

export function bucketAllow(key: string, max: number, windowMs: number, now: number = Date.now()): boolean {
  const cutoff = now - windowMs;
  const arr = (buckets.get(key) ?? []).filter((t) => t > cutoff);
  const allowed = arr.length < max;
  if (allowed) arr.push(now);
  buckets.set(key, arr);
  // Amortized global prune so abandoned keys can't grow unbounded.
  if (++ops % 500 === 0) {
    for (const [k, v] of buckets) {
      const live = v.filter((t) => t > cutoff);
      if (live.length === 0) buckets.delete(k);
      else buckets.set(k, live);
    }
  }
  return allowed;
}

/** Test hook. */
export function _resetBuckets(): void {
  buckets.clear();
  ops = 0;
}
