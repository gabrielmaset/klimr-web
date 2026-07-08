import Link from "next/link";
import { Trash2, Search } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";
import { SPORTS } from "@/lib/sports";
import { deleteFeedItem } from "../actions";
import { UpdateComposer } from "./UpdateComposer";

export const metadata = { title: "Updates · Admin" };

type Row = {
  id: string;
  kind: string;
  title: string | null;
  body: string;
  sport_key: string | null;
  published_at: string;
  created_by: string | null;
};

const KIND_LABEL: Record<string, string> = {
  announcement: "Announcement",
  news: "News",
  result: "Match result",
  update: "Product update",
};
const KINDS = ["announcement", "news", "result", "update"];

export default async function AdminUpdatesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kind?: string; sport?: string; by?: string; from?: string; to?: string }>;
}) {
  await requireAdmin("admin");
  const sp = await searchParams;
  const admin = createAdminClient();

  // Admins, for the "posted by" filter.
  const { data: adminRows } = await admin.from("admin_users").select("user_id");
  const adminIds = [...new Set((adminRows ?? []).map((a) => a.user_id))];
  const { data: adminProfiles } = adminIds.length
    ? await admin.from("profiles").select("id, display_name").in("id", adminIds)
    : { data: [] as { id: string; display_name: string }[] };
  const admins = ((adminProfiles as { id: string; display_name: string }[] | null) ?? []).sort((a, b) =>
    (a.display_name || "").localeCompare(b.display_name || ""),
  );

  // Filtered list of every admin's posts.
  let query = admin
    .from("feed_items")
    .select("id, kind, title, body, sport_key, published_at, created_by")
    .order("published_at", { ascending: false })
    .limit(100);
  if (sp.kind && KINDS.includes(sp.kind)) query = query.eq("kind", sp.kind);
  if (sp.sport) query = query.eq("sport_key", sp.sport);
  if (sp.by) query = query.eq("created_by", sp.by);
  const q = (sp.q ?? "").replace(/[%,()]/g, "").trim();
  if (q) query = query.or(`title.ilike.%${q}%,body.ilike.%${q}%`);
  if (sp.from) query = query.gte("published_at", new Date(sp.from).toISOString());
  if (sp.to) {
    const d = new Date(sp.to);
    d.setHours(23, 59, 59, 999);
    query = query.lte("published_at", d.toISOString());
  }
  const { data } = await query;
  const items = (data as Row[] | null) ?? [];

  // Poster names.
  const nameMap = new Map(admins.map((a) => [a.id, a.display_name]));
  const missing = [...new Set(items.map((i) => i.created_by).filter((x): x is string => !!x && !nameMap.has(x)))];
  if (missing.length) {
    const { data: more } = await admin.from("profiles").select("id, display_name").in("id", missing);
    for (const m of (more as { id: string; display_name: string }[] | null) ?? []) nameMap.set(m.id, m.display_name);
  }

  const hasFilters = !!(q || sp.kind || sp.sport || sp.by || sp.from || sp.to);
  const ff = "rounded-xl border border-rule bg-surface shadow-e1 px-3 py-2 text-sm text-ink outline-none focus:border-brand";

  return (
    <div>
      <BackButton fallback="/admin" label="Admin" className="press mb-5 inline-flex items-center gap-1 text-sm font-semibold text-mute hover:text-ink" size={15} />

      <h1 className="font-display text-3xl text-ink sm:text-4xl">Post an update</h1>
      <p className="mt-1 text-sm text-mute">Publishes to the feed for all members. Use for match results, news, and announcements.</p>

      <UpdateComposer />

      {/* Recent — all admins, filterable */}
      <div className="mt-9 flex items-center justify-between">
        <h2 className="kicker text-faint">Recent · all admins</h2>
        {hasFilters ? (
          <Link href="/admin/updates" className="press text-xs font-semibold text-mute transition-colors hover:text-ink">
            Clear filters
          </Link>
        ) : null}
      </div>

      <form method="get" className="mt-3 grid gap-2 rounded-2xl border border-rule bg-surface shadow-e1 p-3 sm:grid-cols-2 lg:grid-cols-3">
        <div className="relative sm:col-span-2 lg:col-span-1">
          <Search size={15} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input name="q" defaultValue={sp.q ?? ""} placeholder="Keyword…" className={`${ff} w-full pl-9`} />
        </div>
        <select name="kind" defaultValue={sp.kind ?? ""} className={ff} aria-label="Type">
          <option value="">All types</option>
          {KINDS.map((k) => (
            <option key={k} value={k}>{KIND_LABEL[k]}</option>
          ))}
        </select>
        <select name="sport" defaultValue={sp.sport ?? ""} className={ff} aria-label="Sport">
          <option value="">All sports</option>
          {SPORTS.map((s) => (
            <option key={s.key} value={s.key}>{s.emoji} {s.name}</option>
          ))}
        </select>
        <select name="by" defaultValue={sp.by ?? ""} className={ff} aria-label="Posted by">
          <option value="">Any admin</option>
          {admins.map((a) => (
            <option key={a.id} value={a.id}>{a.display_name || "Admin"}</option>
          ))}
        </select>
        <label className="flex items-center gap-2 text-xs text-faint">
          From <input type="date" name="from" defaultValue={sp.from ?? ""} className={`${ff} flex-1`} />
        </label>
        <label className="flex items-center gap-2 text-xs text-faint">
          To <input type="date" name="to" defaultValue={sp.to ?? ""} className={`${ff} flex-1`} />
        </label>
        <div className="flex justify-end sm:col-span-2 lg:col-span-3">
          <button className="press rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft">
            Apply filters
          </button>
        </div>
      </form>

      {items.length === 0 ? (
        <p className="mt-3 text-sm text-mute">No updates {hasFilters ? "match these filters." : "yet."}</p>
      ) : (
        <div className="mt-3 max-h-[30rem] space-y-2 overflow-y-auto rounded-2xl border border-rule bg-bg p-2">
          {items.map((it) => (
            <div key={it.id} className="flex items-start justify-between gap-3 rounded-xl border border-rule bg-surface shadow-e1 px-4 py-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                  <span className="kicker rounded-full bg-bg px-2 py-0.5 text-[9px] text-mute">{KIND_LABEL[it.kind] ?? it.kind}</span>
                  {it.sport_key ? <span className="text-xs capitalize text-faint">{it.sport_key}</span> : null}
                  <span className="text-xs text-faint">· {new Date(it.published_at).toLocaleString("en-US")}</span>
                  {it.created_by ? <span className="text-xs text-faint">· {nameMap.get(it.created_by) ?? "—"}</span> : null}
                </div>
                {it.title ? <p className="mt-0.5 truncate text-sm font-semibold text-ink">{it.title}</p> : null}
                <p className="mt-0.5 line-clamp-2 text-xs text-mute">{it.body}</p>
              </div>
              <form action={deleteFeedItem}>
                <input type="hidden" name="id" value={it.id} />
                <button aria-label="Delete update" className="press grid h-8 w-8 shrink-0 place-items-center rounded-full border border-rule text-mute hover:border-brand/40 hover:text-brand-deep">
                  <Trash2 size={14} />
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
