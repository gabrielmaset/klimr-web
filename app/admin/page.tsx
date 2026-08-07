import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";
import { StaffActionsLog, type StaffAction } from "@/components/staff-actions-log";

export const metadata = { title: "Admin" };

export default async function AdminHome() {
  const { role } = await requireAdmin("support");
  const admin = createAdminClient();

   
  const nowIso = new Date().toISOString();
  const weekAgoIso = new Date(Date.parse(nowIso) - 7 * 86_400_000).toISOString();
  const [openReports, users, openMatches, pendingVerif, restricted, modPosts, modComments, draftBiz, tierApps, signups7, expiredMatches, suggPending] = await Promise.all([
    admin.from("reports").select("*", { count: "exact", head: true }).eq("status", "open"),
    admin.from("profiles").select("*", { count: "exact", head: true }),
    admin.from("matches").select("*", { count: "exact", head: true }).in("status", ["open", "scheduled"]),
    admin.from("profiles").select("*", { count: "exact", head: true }).eq("verification_status", "pending"),
    admin.from("profiles").select("*", { count: "exact", head: true }).in("account_status", ["suspended", "banned"]),
    admin.from("posts").select("*", { count: "exact", head: true }).in("moderation_status", ["pending", "flagged"]),
    admin.from("post_comments").select("*", { count: "exact", head: true }).in("moderation_status", ["pending", "flagged"]),
    admin.from("business_accounts").select("*", { count: "exact", head: true }).eq("status", "draft"),
    admin.from("business_tier_applications").select("*", { count: "exact", head: true }).eq("status", "submitted"),
    admin.from("profiles").select("*", { count: "exact", head: true }).gte("created_at", weekAgoIso),
    admin.from("matches").select("*", { count: "exact", head: true }).in("status", ["open", "scheduled"]).lt("scheduled_at", nowIso),
    admin.from("court_suggestions").select("*", { count: "exact", head: true }).eq("status", "pending"),
  ]);
  const modQueue = (modPosts.count ?? 0) + (modComments.count ?? 0);

  // Every card: a plain-English label, a real number, and a destination.
  // (Analytics-style metrics live in the Insights tab; internal/dev tools
  // like the event-liveness shadow engine live under Diagnostics.)
  const stats: { label: string; value: number; href?: string; accent?: boolean; sub?: string }[] = [
    { label: "Abuse reports \u2014 open", value: openReports.count ?? 0, href: "/admin/reports", accent: (openReports.count ?? 0) > 0 },
    { label: "Moderation queue \u2014 posts & comments", value: modQueue, href: "/admin/moderation", accent: modQueue > 0 },
    { label: "Pending verification", value: pendingVerif.count ?? 0, href: "/admin/users?verification=pending", accent: (pendingVerif.count ?? 0) > 0 },
    { label: "Players", value: users.count ?? 0, href: "/admin/users", sub: `+${(signups7.count ?? 0).toLocaleString("en-US")} in the last 7 days` },
    { label: "Open matches", value: openMatches.count ?? 0 },
    { label: "Expired matches \u2014 past their time", value: expiredMatches.count ?? 0, href: "/admin/expired" },
    { label: "Court suggestions \u2014 awaiting review", value: suggPending.count ?? 0, href: "/admin/court-suggestions", accent: (suggPending.count ?? 0) > 0 },
    { label: "Business listings \u2014 drafts to review", value: draftBiz.count ?? 0, href: "/admin/businesses", accent: (draftBiz.count ?? 0) > 0 },
    { label: "Business tier upgrades \u2014 submitted", value: tierApps.count ?? 0, href: "/admin/businesses?status=active", accent: (tierApps.count ?? 0) > 0 },
    { label: "Suspended / banned", value: restricted.count ?? 0, href: "/admin/users?status=restricted", accent: (restricted.count ?? 0) > 0 },
  ];

  let staffActions: StaffAction[] = [];
  if (role === "superadmin") {
    const { data } = await admin
      .from("admin_actions")
      .select("id, action, created_at, detail, actor_id, target_user_id, target_ref, meta")
      .order("created_at", { ascending: false })
      .limit(100);
    const rows = data ?? [];
    const nameIds = [
      ...new Set(
        rows.flatMap((a) => [a.actor_id, a.target_user_id]).filter((x): x is string => !!x),
      ),
    ];
    const names = new Map<string, string>();
    if (nameIds.length) {
      const { data: ps } = await admin.from("profiles").select("id, display_name").in("id", nameIds);
      for (const x of (ps as { id: string; display_name: string }[] | null) ?? []) names.set(x.id, x.display_name);
    }
    staffActions = rows.map((a) => ({
      id: a.id,
      action: a.action,
      created_at: a.created_at,
      detail: a.detail,
      actorName: a.actor_id ? names.get(a.actor_id) ?? null : null,
      targetName: a.target_user_id ? names.get(a.target_user_id) ?? null : null,
      targetRef: a.target_ref,
      meta: (a.meta as Record<string, unknown> | null) ?? null,
    }));
  }

  // Currently / recently active players — proxied by a last-seen heartbeat the
  // app shell writes on page load (Klimr has no live socket presence).
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const since = new Date(now - 15 * 60_000).toISOString();
  // Courtside fleet: how many displays are OPEN vs actually running live play
  // (founder request Aug 2026, migration 0182). The second number is the one
  // that means a venue is working, not merely powered on.
  const { data: fleetRows } = await admin.rpc("courtside_fleet_status");
  const fleet = fleetRows?.[0];

  const { data: activeRows } = await admin
    .from("profiles")
    .select("id, display_name, last_seen_at")
    .gte("last_seen_at", since)
    .order("last_seen_at", { ascending: false })
    .limit(16);
  const active = (activeRows as { id: string; display_name: string; last_seen_at: string }[] | null) ?? [];
  const rel = (iso: string) => {
    const m = Math.round((now - Date.parse(iso)) / 60_000);
    return m < 1 ? "online now" : m === 1 ? "1 min ago" : `${m} min ago`;
  };
  const isOnline = (iso: string) => now - Date.parse(iso) < 5 * 60_000;

  return (
    <div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {stats.map((s) => {
          const card = (
            <div
              className="rounded-2xl border bg-surface p-5"
              style={{ borderColor: s.accent ? "var(--color-brand)" : "var(--color-rule)" }}
            >
              <div className="kicker text-faint">{s.label}</div>
              <div className="mt-1 font-display text-4xl leading-none" style={{ color: s.accent ? "var(--color-brand-deep)" : "var(--color-ink)" }}>
                {s.value.toLocaleString("en-US")}
              </div>
              {s.sub ? <div className="mt-1 text-[11px] font-semibold text-mute">{s.sub}</div> : null}
            </div>
          );
          return s.href ? (
            <Link key={s.label} href={s.href} className="lift block">
              {card}
            </Link>
          ) : (
            <div key={s.label}>{card}</div>
          );
        })}
      </div>

      <Link href="/admin/devices" className="lift mt-7 block">
        <div className="rounded-2xl border bg-surface p-5" style={{ borderColor: (fleet?.in_active_play ?? 0) > 0 ? "var(--color-brand)" : "var(--color-rule)" }}>
          <div className="kicker flex items-center gap-2 text-faint">
            <span
              className="h-2 w-2 rounded-full"
              style={{ background: (fleet?.in_active_play ?? 0) > 0 ? "var(--color-success)" : "var(--color-faint)" }}
            />
            Courtside displays
          </div>
          <div className="mt-2 flex flex-wrap items-baseline gap-x-6 gap-y-2">
            <div>
              <span className="font-display text-4xl leading-none" style={{ color: "var(--color-brand-deep)" }}>
                {(fleet?.in_active_play ?? 0).toLocaleString("en-US")}
              </span>
              <span className="ml-2 text-[11px] font-semibold text-mute">running live play</span>
            </div>
            <div className="text-[11px] font-semibold text-mute">
              {fleet?.on_live_session ?? 0} on a live session · {fleet?.app_open ?? 0} app open ·{" "}
              {fleet?.registered ?? 0} registered
            </div>
          </div>
          <div className="mt-1 text-[11px] text-faint">
            &ldquo;Running live play&rdquo; means a team is waiting or a match is in progress — not just that the app is open. Open for live queue counts and force-end.
          </div>
        </div>
      </Link>

      <div className="mt-7">
        <div className="kicker mb-3 flex items-center gap-2 text-faint">
          <span className="h-2 w-2 rounded-full" style={{ background: active.some((u) => isOnline(u.last_seen_at)) ? "var(--color-success)" : "var(--color-faint)" }} />
          Active now · {active.length}
        </div>
        {active.length === 0 ? (
          <p className="text-sm text-mute">No players active in the last 15 minutes.</p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {active.map((u) => (
              <Link
                key={u.id}
                href={`/admin/users/${u.id}`}
                className="lift flex items-center gap-2 rounded-lg border border-rule bg-surface px-3 py-1.5 text-sm"
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: isOnline(u.last_seen_at) ? "var(--color-success)" : "var(--color-faint)" }} />
                <span className="font-semibold text-ink">{u.display_name || "Player"}</span>
                <span className="text-xs text-faint">{rel(u.last_seen_at)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {role === "superadmin" ? (
        <div className="mt-8">
          <div className="mb-3 flex items-center justify-between gap-3">
            <div className="kicker text-faint">Recent staff actions</div>
            <Link href="/admin/actions" className="text-xs font-semibold text-brand-deep transition-colors hover:underline">View all &rarr;</Link>
          </div>
          {staffActions.length === 0 ? (
            <p className="text-sm text-mute">No actions recorded yet.</p>
          ) : (
            <StaffActionsLog actions={staffActions} />
          )}
        </div>
      ) : null}
    </div>
  );
}
