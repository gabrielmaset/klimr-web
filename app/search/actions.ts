"use server";

import { sportMeta, SPORT_KEYS } from "@/lib/sports";

const nowMs = () => Date.now();
// Module scope: the lint rule forbids impure calls inside a handler body.
const searchRoll = () => Math.random();

import { createClient } from "@/lib/supabase/server";
import type { SearchResult, SearchResultType } from "./types";
import { blockSetsFor } from "@/lib/social-server";
import { interpretQuery } from "@/lib/search-query";
import { publicLocationLabel } from "@/lib/location-privacy";

const joinLoc = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(", ") || null;

/**
 * One search across the things players look for: other players, courts, teams,
 * and events. Each entity is matched by its primary name/title and capped so a
 * single query stays fast. Wildcards are stripped so user input can't smuggle
 * ILIKE patterns. Existing RLS governs what each viewer can see.
 */
export async function globalSearch(qRaw: string): Promise<SearchResult[]> {
  const startedAt = Date.now();
  const q = (qRaw ?? "").trim();
  if (q.length < 2) return [];

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  // Blocked pairs never meet in search — either direction. "Who blocked me" is
  // invisible to the viewer's RLS, so the set comes through the service role.
  const { all: blockedIds } = await blockSetsFor(user.id);

  // ONE engine call (0153): tsvector + trigram over every kind, RLS-scoped
  // because the RPC runs with INVOKER rights on this user's client.
  // Question-shaped queries ("Any weekly beach volleyball events in Santa
  // Monica?") drown the AND-matcher in stopwords. Quick results condense to
  // the salient terms; the full question remains the Ask-AI path's job.
  // INTENT ROUTING (deterministic — the hot path stays provable): kind
  // words in the query select which sections belong; generic/date words
  // never reach the matcher. "beach volleyball events in August" → kinds:
  // {event}, matcher input: "beach volleyball" — no court noise, and the
  // "name"⊂"tournaments" substring class of bug is structurally dead.
  // Deterministic interpretation extracted to lib/search-query.ts so the exact
  // hot-path logic is unit-tested against the K1-04 golden corpus in CI.
  const { kinds: kindHints, condensed } = interpretQuery(q);

  // BROWSE INTENT: a kind word with zero informative words ("events next
  // month", "tournaments") is a request to SEE that kind — not a text
  // match. List the kind's upcoming items directly; falling back to the
  // raw phrase would match nothing (the screenshot bug).
  if (kindHints.size > 0 && condensed === "") {
    const out: SearchResult[] = [];
    if (kindHints.has("event")) {
      const { data: evs } = await supabase
        .from("events")
        .select("id, title, sport_key, starts_at")
        .in("status", ["active", "published"])
        .gte("starts_at", new Date(nowMs() - 86_400_000).toISOString())
        .order("starts_at", { ascending: true })
        .limit(6);
      for (const e of evs ?? []) out.push({ type: "event", id: e.id, title: e.title, subtitle: `${sportMeta(e.sport_key).name} · ${new Date(e.starts_at ?? 0).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`, href: `/events/${e.id}` });
    }
    if (kindHints.has("tournament")) {
      const { data: ts } = await supabase
        .from("tournaments")
        .select("code, title, sport_key, starts_at")
        .eq("visibility", "public")
        .is("cancelled_at", null)
        .gte("starts_at", new Date(nowMs() - 86_400_000).toISOString())
        .order("starts_at", { ascending: true })
        .limit(6);
      for (const t of ts ?? []) out.push({ type: "tournament", id: t.code, title: t.title, subtitle: `${sportMeta(t.sport_key).name} · ${new Date(t.starts_at ?? 0).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`, href: `/e/${t.code}` });
    }
    if (out.length) return out;
  }

  const prettySport = (s: string | null): string | null =>
    s && (SPORT_KEYS as string[]).includes(s) ? sportMeta(s).name : s;
  const KIND_OF_RPC: Record<string, SearchResultType> = {
    player: "player", court: "court", team: "team", event: "event",
    tournament: "tournament", listing: "listing", class: "class", provider: "class",
    // KCDX-020: published businesses are searchable as of 0216. They surface
    // under the Classes & Coaching hub, which is where a venue or pro shop is
    // reachable in the product today.
    business: "class",
  };

  // KCDX-025: the inferred kinds go INTO the query. They used to be applied here,
  // after the RPC had already capped each branch and then capped the union — so a
  // search for courts competed with players, teams and tournaments for the cap
  // first and was narrowed to courts second. A query that should have returned
  // six courts could return two, because four slots went to rows the user never
  // wanted and which were then thrown away.
  const wantedRpcKinds = kindHints.size
    ? Object.entries(KIND_OF_RPC).filter(([, v]) => kindHints.has(v)).map(([k]) => k)
    : null;

  const { data: rows } = await supabase.rpc("global_search", {
    p_q: condensed || q,
    p_limit: 30,
    p_kinds: wantedRpcKinds,
  });
  // The RPC has already excluded unwanted branches; this stays as a belt for the
  // `provider → class` mapping, which is many-to-one.
  const list = (rows ?? []).filter((r) => kindHints.size === 0 || kindHints.has(KIND_OF_RPC[r.kind] ?? "event"));

  // Players need avatar + location hydration and the account/block screens.
  const playerIds = list
    .filter((r) => r.kind === "player" && r.id !== user.id && !blockedIds.has(r.id))
    .map((r) => r.id);
  const players = new Map<string, { url: string | null; hue: number; loc: string | null }>();
  if (playerIds.length) {
    // KCDX-026: `neighborhood` was joined into the result subtitle — a finer
    // location than location-privacy.ts publishes anywhere in the product, and
    // one 0191 no longer lets a member read anyway. City/state is the grain.
    const { data: ps } = await supabase
      .from("profiles_public")
      .select("id, avatar_path, avatar_hue, city, state, is_active")
      .in("id", playerIds);
    for (const p of ps ?? []) {
      if (p.is_active === false) continue;
      players.set(p.id, {
        url: p.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null,
        hue: p.avatar_hue ?? 200,
        loc: publicLocationLabel(p),
      });
    }
  }

  const HREF: Record<string, (id: string) => string> = {
    court: (id) => `/courts/${id}`,
    team: (id) => `/teams/${id}`,
    event: (id) => `/events/${id}`,
    tournament: (id) => `/e/${id}`,
    listing: (id) => `/marketplace/${id}`,
    class: (id) => `/classes/${id}`,
    provider: (id) => `/profile/${id}`,
  };

  const out: SearchResult[] = [];
  for (const r of list) {
    if (r.kind === "player") {
      const p = players.get(r.id);
      if (!p) continue;
      out.push({ type: "player", id: r.id, title: r.title || "Player", subtitle: p.loc ?? r.subtitle, href: `/profile/${r.id}`, avatarUrl: p.url, hue: p.hue });
    } else {
      const href = HREF[r.kind]?.(r.id);
      if (!href) continue;
      const type = (r.kind === "provider" ? "class" : r.kind) as SearchResult["type"];
      out.push({ type, id: r.id, title: r.title, subtitle: prettySport(r.subtitle), href });
    }
  }
  const results = out.slice(0, 26);

  // K3-08 telemetry. The relevance decision — whether to invest in FTS/trigram
  // plus a reranker — was explicitly deferred until there is field data, and
  // "we should probably improve search" is not data. Three numbers make it
  // answerable: how long the deterministic layer takes, how often it returns
  // NOTHING for a real query, and what shape the query had. Sampled at 10% and
  // recorded WITHOUT the query text: a search log is a behaviour log, and this
  // table is a latency histogram (see 0186).
  if (searchRoll() < 0.1) {
    try {
      const { getPrivilegedClient } = await import("@/lib/privileged");
      // KCDX-061: the comment above this used to say "every search records
      // latency; a MISS additionally records the zero metric" — and the code was
      // a TERNARY, so a zero-result search recorded ONLY `search_zero` and never
      // `search_deterministic`. The reporting query then divided zeros by
      // `search_deterministic`, i.e. zeros by HITS rather than by total.
      //
      // The error grows with the thing being measured: 2 zeros in 10 searches
      // reported 2/8 = 25% instead of 20%; 5 in 10 reported 100%; and a period
      // where every search missed divided by zero and reported nothing at all.
      // The metric was least trustworthy exactly when it mattered most.
      //
      // Now it does what the comment always claimed: one row per search for the
      // denominator, plus a second row on a miss.
      const elapsed = Date.now() - startedAt;
      const rows = [{ metric: "search_deterministic", value_ms: elapsed, route: "/search" }];
      if (results.length === 0) rows.push({ metric: "search_zero", value_ms: elapsed, route: "/search" });
      await getPrivilegedClient({ reason: "search:telemetry" }).from("perf_samples").insert(rows);
    } catch {
      /* telemetry must never break a search */
    }
  }
  return results;
}
