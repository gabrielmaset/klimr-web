import type { AiItem } from "@/lib/ai-search";

/** Hydrate the model's item list from the server-owned bank — IDs ONLY
 *  (Aug 2026, audit SRCH-001 + ADD-02).
 *
 *  The model may reference results solely by the short ids (r1, r2, …) the
 *  tool handlers minted this turn. Anything else — objects it shaped itself,
 *  unknown ids, non-strings — is dropped. The old fallback accepted
 *  model-minted objects when `href.startsWith("/")`, which (a) let a
 *  prompt-injected model steer members to arbitrary internal routes with
 *  invented labels, and (b) passed protocol-relative externals, since
 *  "//evil.example".startsWith("/") is true. Grounding is the product
 *  guarantee; a model regression now yields fewer results, never fake ones.
 *  The belt stays on even for bank items: internal path, no "//". */
export function hydrateItems(raw: unknown[] | undefined | null, bank: ReadonlyMap<string, AiItem>): AiItem[] {
  return (raw ?? [])
    .map((i) => (typeof i === "string" ? bank.get(i.trim()) : undefined))
    .filter((i): i is AiItem => !!i && typeof i.href === "string" && i.href.startsWith("/") && !i.href.startsWith("//"))
    .slice(0, 8)
    .map((i) => ({
      title: String(i.title ?? "").slice(0, 90),
      subtitle: i.subtitle ? String(i.subtitle).slice(0, 90) : undefined,
      meta: i.meta ? String(i.meta).slice(0, 90) : undefined,
      href: i.href,
    }));
}
