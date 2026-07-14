/** Segment-level loading UI — paints INSTANTLY on navigation while the server
 *  renders, so clicks always answer within a frame. Shell (nav/top bar) stays
 *  interactive; only the content area shimmers. */
export function PageSkeleton() {
  return (
    <div className="mx-auto max-w-page animate-pulse px-5 py-8 sm:py-10" aria-busy="true" aria-live="polite">
      <div className="h-3 w-40 rounded-full bg-[rgba(32,27,18,0.06)]" />
      <div className="mt-3 h-9 w-72 rounded-xl bg-[rgba(32,27,18,0.08)]" />
      <div className="mt-2 h-3.5 w-96 max-w-full rounded-full bg-[rgba(32,27,18,0.05)]" />
      <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <div key={i} className="h-44 rounded-3xl border border-rule-soft bg-[rgba(32,27,18,0.04)]" />
        ))}
      </div>
    </div>
  );
}
