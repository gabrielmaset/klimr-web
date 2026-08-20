import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";

export const metadata = { title: "Insights · Admin" };

/** The operating reports an early social-sports network actually runs on:
 *  growth (are people arriving), engagement (are they coming back and
 *  playing), content, competition, marketplace, and trust & safety. Every
 *  number is a cheap head-count over verified columns; sections are ordered
 *  by how often an operator checks them. ("Reports" as a word belongs to
 *  abuse reports under Moderation, hence this tab is Insights.) */
export default async function AdminInsights() {
  await requireAdmin("support");
  const admin = createAdminClient();

  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const iso = (hoursAgo: number) => new Date(nowMs - hoursAgo * 3_600_000).toISOString();
  const nowIso = new Date(nowMs).toISOString();
  const h24 = iso(24);
  const d7 = iso(24 * 7);
  const d30 = iso(24 * 30);

  const c = (q: PromiseLike<{ count: number | null }>) => q;
  const [
    playersTotal,
    signups24,
    signups7,
    signups30,
    active24,
    active7,
    active30,
    matches7,
    matches30,
    checkins7,
    queues7,
    queuesLive,
    postsLive,
    posts7,
    comments7,
    tournamentsUpcoming,
    regs7,
    subs7,
    listingsLive,
    listings7,
    reportsOpen,
    modPosts,
    modComments,
    pendingVerif,
    restricted,
  ] = await Promise.all([
    c(admin.from("profiles").select("*", { count: "exact", head: true })),
    c(admin.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", h24)),
    c(admin.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", d7)),
    c(admin.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", d30)),
    c(admin.from("profiles").select("*", { count: "exact", head: true }).gte("last_seen_at", h24)),
    c(admin.from("profiles").select("*", { count: "exact", head: true }).gte("last_seen_at", d7)),
    c(admin.from("profiles").select("*", { count: "exact", head: true }).gte("last_seen_at", d30)),
    c(admin.from("matches").select("*", { count: "exact", head: true }).gte("created_at", d7)),
    c(admin.from("matches").select("*", { count: "exact", head: true }).gte("created_at", d30)),
    c(admin.from("court_checkins").select("*", { count: "exact", head: true }).gte("created_at", d7)),
    c(admin.from("court_sessions").select("*", { count: "exact", head: true }).gte("created_at", d7)),
    c(admin.from("court_sessions").select("*", { count: "exact", head: true }).eq("status", "live")),
    c(admin.from("posts").select("*", { count: "exact", head: true }).eq("moderation_status", "approved")),
    c(admin.from("posts").select("*", { count: "exact", head: true }).gte("created_at", d7)),
    c(admin.from("post_comments").select("*", { count: "exact", head: true }).gte("created_at", d7)),
    c(admin.from("tournaments").select("*", { count: "exact", head: true }).gte("starts_at", nowIso)),
    c(admin.from("tournament_registrations").select("*", { count: "exact", head: true }).gte("created_at", d7)),
    c(admin.from("tournament_substitution_requests").select("*", { count: "exact", head: true }).gte("created_at", d7)),
    c(admin.from("marketplace_listings").select("*", { count: "exact", head: true }).eq("status", "active")),
    c(admin.from("marketplace_listings").select("*", { count: "exact", head: true }).gte("created_at", d7)),
    c(admin.from("reports").select("*", { count: "exact", head: true }).eq("status", "open")),
    c(admin.from("posts").select("*", { count: "exact", head: true }).in("moderation_status", ["pending", "flagged"])),
    c(admin.from("post_comments").select("*", { count: "exact", head: true }).in("moderation_status", ["pending", "flagged"])),
    c(admin.from("profiles").select("*", { count: "exact", head: true }).eq("verification_status", "pending")),
    c(admin.from("profiles").select("*", { count: "exact", head: true }).in("account_status", ["suspended", "banned"])),
  ]);

  const n = (x: { count: number | null }) => (x.count ?? 0).toLocaleString("en-US");

  const sections: { title: string; note?: string; rows: { label: string; value: string; href?: string }[] }[] = [
    {
      title: "Growth",
      note: "Are people arriving?",
      rows: [
        { label: "Players — total", value: n(playersTotal), href: "/admin/users" },
        { label: "New signups — last 24h", value: n(signups24), href: "/admin/users?signups=24" },
        { label: "New signups — last 7 days", value: n(signups7), href: "/admin/users?signups=168" },
        { label: "New signups — last 30 days", value: n(signups30), href: "/admin/users?signups=720" },
      ],
    },
    {
      title: "Engagement",
      note: "Are they coming back and playing?",
      rows: [
        { label: "Active players — last 24h", value: n(active24) },
        { label: "Active players — last 7 days", value: n(active7) },
        { label: "Active players — last 30 days", value: n(active30) },
        { label: "Matches created — last 7 days", value: n(matches7) },
        { label: "Matches created — last 30 days", value: n(matches30) },
        { label: "Court check-ins — last 7 days", value: n(checkins7) },
        { label: "Live queues — running now", value: n(queuesLive), href: "/queue" },
        { label: "Queue sessions created — last 7 days", value: n(queues7) },
      ],
    },
    {
      title: "Content",
      rows: [
        { label: "Posts live", value: n(postsLive) },
        { label: "Posts created — last 7 days", value: n(posts7) },
        { label: "Comments — last 7 days", value: n(comments7) },
      ],
    },
    {
      title: "Competition",
      rows: [
        { label: "Tournaments — upcoming", value: n(tournamentsUpcoming), href: "/admin/tournaments" },
        { label: "Tournament registrations — last 7 days", value: n(regs7) },
        { label: "Substitution requests — last 7 days", value: n(subs7) },
      ],
    },
    {
      title: "Marketplace",
      rows: [
        { label: "Listings — live", value: n(listingsLive) },
        { label: "New listings — last 7 days", value: n(listings7) },
      ],
    },
    {
      title: "Trust & safety",
      rows: [
        { label: "Abuse reports — open", value: n(reportsOpen), href: "/admin/reports" },
        { label: "Moderation queue — posts & comments", value: ((modPosts.count ?? 0) + (modComments.count ?? 0)).toLocaleString("en-US"), href: "/admin/moderation" },
        { label: "Pending verification", value: n(pendingVerif), href: "/admin/users?verification=pending" },
        { label: "Suspended / banned", value: n(restricted), href: "/admin/users?status=restricted" },
      ],
    },
  ];

  return (
    <div>
      <h1 className="font-display text-2xl font-bold text-ink">Insights</h1>
      <p className="mt-1 text-sm text-mute">Operating reports across growth, engagement, content, competition, marketplace, and safety. Numbers are live at page load.</p>

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        {sections.map((s) => (
          <section key={s.title} className="rounded-[14px] border border-rule bg-white p-4">
            <div className="flex items-baseline justify-between gap-2">
              <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-faint">{s.title}</p>
              {s.note ? <p className="text-[11px] text-faint">{s.note}</p> : null}
            </div>
            <div className="mt-2 divide-y divide-rule-soft">
              {s.rows.map((r) => {
                const row = (
                  <div className="flex items-center justify-between gap-3 py-2">
                    <span className="text-[13px] text-mute">{r.label}</span>
                    <span className="font-mono text-[15px] font-bold text-ink">{r.value}</span>
                  </div>
                );
                return r.href ? (
                  <Link key={r.label} href={r.href} className="block transition-colors hover:bg-surface">
                    {row}
                  </Link>
                ) : (
                  <div key={r.label}>{row}</div>
                );
              })}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
