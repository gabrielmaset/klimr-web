"use server";

import { createClient } from "@/lib/supabase/server";
import type { SearchResult } from "./types";
import { blockSetsFor } from "@/lib/social-server";

const joinLoc = (...parts: (string | null | undefined)[]) => parts.filter(Boolean).join(", ") || null;

/**
 * One search across the things players look for: other players, courts, teams,
 * and events. Each entity is matched by its primary name/title and capped so a
 * single query stays fast. Wildcards are stripped so user input can't smuggle
 * ILIKE patterns. Existing RLS governs what each viewer can see.
 */
export async function globalSearch(qRaw: string): Promise<SearchResult[]> {
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
  const STOP = new Set(["any","all","some","the","a","an","in","on","at","for","to","of","with","near","me","my","our","is","are","there","what","when","where","which","who","how","do","does","can","i","you","we","next","this","week","weekly","month","monthly","today","tomorrow","upcoming","events","event","find","show","looking","want"]);
  const words = q.split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  const isQuestion = q.includes("?") || words.length > 4;
  const condensed = isQuestion
    ? words.filter((w) => !STOP.has(w.toLowerCase())).slice(0, 4).join(" ") || q
    : q;
  const { data: rows } = await supabase.rpc("global_search", { p_q: condensed, p_limit: 30 });
  const list = rows ?? [];

  // Players need avatar + location hydration and the account/block screens.
  const playerIds = list
    .filter((r) => r.kind === "player" && r.id !== user.id && !blockedIds.has(r.id))
    .map((r) => r.id);
  const players = new Map<string, { url: string | null; hue: number; loc: string | null }>();
  if (playerIds.length) {
    const { data: ps } = await supabase
      .from("profiles")
      .select("id, avatar_path, avatar_hue, neighborhood, city, account_status")
      .in("id", playerIds);
    for (const p of ps ?? []) {
      if (p.account_status !== "active") continue;
      players.set(p.id, {
        url: p.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null,
        hue: p.avatar_hue ?? 200,
        loc: joinLoc(p.neighborhood, p.city),
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
      out.push({ type, id: r.id, title: r.title, subtitle: r.subtitle, href });
    }
  }
  return out.slice(0, 26);
}
