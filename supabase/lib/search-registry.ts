// lib/search-registry.ts — the extensibility spine of AI search.
//
// THE CONTRACT: adding a searchable feature to Klimr = adding ONE entry here.
// The generic `search_domain` tool reads this registry at runtime and builds
// its own domain enum + descriptions, so the model learns about new domains
// the moment they're declared — no tool-code changes, ever.
//
// SECURITY: every query still runs on the USER's client (RLS decides
// visibility — e.g. posts respect audience, notifications are self-only).
// `select` lists are explicit safe columns; hrefs are minted here, server-
// side. `kind: "personal"` marks self-data domains so the model phrases
// results as the user's own.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/database.types";

type DB = SupabaseClient<Database>;
export type RegistryItem = { title: string; subtitle?: string; meta?: string; href: string };

export type DomainDef = {
  key: string;
  label: string;
  kind: "public" | "personal";
  description: string;
  run: (db: DB, userId: string, a: { text?: string; sport?: string; limit?: number }) => Promise<RegistryItem[]>;
};

const clean = (s?: string) => (s ?? "").replace(/[%,()]/g, "");
const when = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });

export const SEARCH_REGISTRY: DomainDef[] = [
  {
    key: "posts",
    label: "Feed posts",
    kind: "public",
    description: "Posts on the Klimr feed (audience privacy enforced — the user only sees posts shared with them).",
    run: async (db, _u, a) => {
      let q = db
        .from("posts")
        .select("id, body, sport_key, post_type, created_at")
        .eq("moderation_status", "approved")
        .order("created_at", { ascending: false })
        .limit(a.limit ?? 8);
      if (a.text) q = q.ilike("body", `%${clean(a.text)}%`);
      if (a.sport) q = q.eq("sport_key", a.sport);
      const { data } = await q;
      return (data ?? []).map((p) => ({
        title: (p.body ?? "").slice(0, 80) || p.post_type,
        subtitle: [p.sport_key, when(p.created_at)].filter(Boolean).join(" · "),
        href: `/feed?post=${p.id}`,
      }));
    },
  },
  {
    key: "sponsorships",
    label: "Sponsorships",
    kind: "public",
    description: "Sponsorship arrangements visible to the user (businesses sponsoring players, teams, tournaments).",
    run: async (db, _u, a) => {
      let q = db
        .from("sponsorships")
        .select("id, label, description, target_kind, amount_cents, starts_on")
        .eq("status", "active")
        .order("starts_on", { ascending: false })
        .limit(a.limit ?? 8);
      if (a.text) q = q.or(`label.ilike.%${clean(a.text)}%,description.ilike.%${clean(a.text)}%`);
      const { data } = await q;
      return (data ?? []).map((s) => ({
        title: s.label,
        subtitle: s.target_kind,
        meta: s.amount_cents != null ? `$${(s.amount_cents / 100).toFixed(0)}` : undefined,
        href: "/sponsorships",
      }));
    },
  },
  {
    key: "region_challenges",
    label: "Region challenges",
    kind: "public",
    description: "ZIP-vs-ZIP / region-vs-region sport challenges (active and upcoming).",
    run: async (db, _u, a) => {
      let q = db
        .from("region_challenges")
        .select("id, sport_key, region_a, region_b, status, starts_at")
        .in("status", ["active", "upcoming"])
        .order("starts_at", { ascending: false })
        .limit(a.limit ?? 8);
      if (a.sport) q = q.eq("sport_key", a.sport);
      const { data } = await q;
      return (data ?? []).map((c) => ({
        title: `${c.region_a} vs ${c.region_b}`,
        subtitle: `${c.sport_key} · ${c.status}`,
        meta: when(c.starts_at),
        href: "/challenges",
      }));
    },
  },
  {
    key: "my_notifications",
    label: "Your notifications",
    kind: "personal",
    description: "The user's OWN notifications (unread and recent).",
    run: async (db, userId, a) => {
      let q = db
        .from("notifications")
        .select("id, kind, title, body, link_url, read_at, created_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(a.limit ?? 8);
      if (a.text) q = q.or(`title.ilike.%${clean(a.text)}%,body.ilike.%${clean(a.text)}%`);
      const { data } = await q;
      return (data ?? []).map((n) => ({
        title: n.title,
        subtitle: `${n.read_at ? "read" : "unread"} · ${when(n.created_at)}`,
        meta: n.body?.slice(0, 60) ?? undefined,
        href: n.link_url && n.link_url.startsWith("/") ? n.link_url : "/notifications",
      }));
    },
  },
  {
    key: "my_invites",
    label: "Your invites",
    kind: "personal",
    description: "Match and team invites waiting on the user.",
    run: async (db, userId, a) => {
      const out: RegistryItem[] = [];
      const { data: mi } = await db
        .from("match_invites")
        .select("id, status, created_at")
        .eq("invited_user_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(a.limit ?? 6);
      for (const m of mi ?? []) out.push({ title: "Match invite", subtitle: `pending · ${when(m.created_at)}`, href: "/invites" });
      const { data: ti } = await db
        .from("team_invites")
        .select("id, status, created_at")
        .eq("invited_user_id", userId)
        .eq("status", "pending")
        .order("created_at", { ascending: false })
        .limit(a.limit ?? 6);
      for (const t of ti ?? []) out.push({ title: "Team invite", subtitle: `pending · ${when(t.created_at)}`, href: "/invites" });
      return out.slice(0, 8);
    },
  },
];

/** Runtime description block for the tool schema — the model's map of what
 *  exists. New registry entries appear here automatically. */
export const registryDescription = () =>
  SEARCH_REGISTRY.map((d) => `- ${d.key} (${d.kind}): ${d.description}`).join("\n");

export const registryKeys = () => SEARCH_REGISTRY.map((d) => d.key);
