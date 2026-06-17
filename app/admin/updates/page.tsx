import Link from "next/link";
import { ChevronLeft, Trash2 } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";
import { SPORTS } from "@/lib/sports";
import { createFeedItem, deleteFeedItem } from "../actions";

export const metadata = { title: "Updates · Admin" };

type Row = { id: string; kind: string; title: string | null; body: string; sport_key: string | null; published_at: string };

export default async function AdminUpdatesPage() {
  await requireAdmin("admin");
  const admin = createAdminClient();
  const { data } = await admin
    .from("feed_items")
    .select("id, kind, title, body, sport_key, published_at")
    .order("published_at", { ascending: false })
    .limit(30);
  const items = (data as Row[] | null) ?? [];

  const field = "w-full rounded-xl border border-rule bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-brand";

  return (
    <div>
      <Link href="/admin" className="press mb-5 inline-flex items-center gap-1 text-sm font-semibold text-mute hover:text-ink">
        <ChevronLeft size={15} /> Admin
      </Link>

      <h1 className="font-display text-3xl text-ink sm:text-4xl">Post an update</h1>
      <p className="mt-1 text-sm text-mute">Publishes to the feed for all members. Use for match results, news, and announcements.</p>

      <form action={createFeedItem} className="mt-5 rounded-2xl border border-rule bg-surface p-4 sm:p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="kicker text-faint">Type</span>
            <select name="kind" defaultValue="announcement" className={`mt-1 ${field}`}>
              <option value="announcement">Announcement</option>
              <option value="news">News</option>
              <option value="result">Match result</option>
              <option value="update">Product update</option>
            </select>
          </label>
          <label className="block">
            <span className="kicker text-faint">Sport (optional)</span>
            <select name="sport_key" defaultValue="" className={`mt-1 ${field}`}>
              <option value="">None</option>
              {SPORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.emoji} {s.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mt-3 block">
          <span className="kicker text-faint">Title (optional)</span>
          <input name="title" maxLength={120} className={`mt-1 ${field}`} placeholder="Headline" />
        </label>

        <label className="mt-3 block">
          <span className="kicker text-faint">Body</span>
          <textarea name="body" rows={4} maxLength={2000} required className={`mt-1 resize-none ${field}`} placeholder="What's the update?" />
        </label>

        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="kicker text-faint">Link URL (optional)</span>
            <input name="link_url" className={`mt-1 ${field}`} placeholder="/rankings or https://…" />
          </label>
          <label className="block">
            <span className="kicker text-faint">Link label (optional)</span>
            <input name="link_label" maxLength={40} className={`mt-1 ${field}`} placeholder="View rankings" />
          </label>
        </div>

        <button className="press mt-4 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft">
          Publish
        </button>
      </form>

      <h2 className="kicker mt-8 text-faint">Recent</h2>
      {items.length === 0 ? (
        <p className="mt-2 text-sm text-mute">No updates yet.</p>
      ) : (
        <div className="mt-2 space-y-2">
          {items.map((it) => (
            <div key={it.id} className="flex items-start justify-between gap-3 rounded-xl border border-rule bg-surface px-4 py-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="kicker text-faint">{it.kind}</span>
                  <span className="text-xs text-faint">{new Date(it.published_at).toLocaleString("en-US")}</span>
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
