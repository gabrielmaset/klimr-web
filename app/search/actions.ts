"use server";

import { createClient } from "@/lib/supabase/server";
import type { SearchResult } from "./types";

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

  const like = `%${q.replace(/[%_\\]/g, "")}%`;

  const [players, courts, teams, events] = await Promise.all([
    supabase
      .from("profiles")
      .select("id, display_name, neighborhood, city, avatar_path, avatar_hue")
      .ilike("display_name", like)
      .eq("account_status", "active")
      .neq("id", user.id)
      .limit(5),
    supabase.from("courts").select("id, name, neighborhood, city").ilike("name", like).limit(4),
    supabase.from("teams").select("id, name, city").ilike("name", like).limit(3),
    supabase.from("events").select("id, title, starts_at").ilike("title", like).eq("status", "active").limit(3),
  ]);

  const out: SearchResult[] = [];

  for (const p of players.data ?? []) {
    out.push({
      type: "player",
      id: p.id,
      title: p.display_name || "Player",
      subtitle: joinLoc(p.neighborhood, p.city),
      href: `/profile/${p.id}`,
      avatarUrl: p.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null,
      hue: p.avatar_hue ?? 200,
    });
  }
  for (const c of courts.data ?? []) {
    out.push({ type: "court", id: c.id, title: c.name, subtitle: joinLoc(c.neighborhood, c.city), href: `/courts/${c.id}` });
  }
  for (const t of teams.data ?? []) {
    out.push({ type: "team", id: t.id, title: t.name, subtitle: t.city ?? null, href: `/teams/${t.id}` });
  }
  for (const e of events.data ?? []) {
    out.push({
      type: "event",
      id: e.id,
      title: e.title,
      subtitle: e.starts_at ? new Date(e.starts_at).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : null,
      href: `/events/${e.id}`,
    });
  }

  return out;
}
