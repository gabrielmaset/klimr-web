import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";

export const metadata = { title: "Admin" };

export default async function AdminHome() {
  const { role } = await requireAdmin("support");
  const admin = createAdminClient();

  const [openReports, users, posts, openMatches, pendingVerif, restricted] = await Promise.all([
    admin.from("reports").select("*", { count: "exact", head: true }).eq("status", "open"),
    admin.from("profiles").select("*", { count: "exact", head: true }),
    admin.from("posts").select("*", { count: "exact", head: true }).eq("moderation_status", "approved"),
    admin.from("matches").select("*", { count: "exact", head: true }).in("status", ["open", "scheduled"]),
    admin.from("profiles").select("*", { count: "exact", head: true }).eq("verification_status", "pending"),
    admin.from("profiles").select("*", { count: "exact", head: true }).in("account_status", ["suspended", "banned"]),
  ]);

  const stats = [
    { label: "Open reports", value: openReports.count ?? 0, href: "/admin/reports", accent: (openReports.count ?? 0) > 0 },
    { label: "Players", value: users.count ?? 0, href: "/admin/users" },
    { label: "Posts live", value: posts.count ?? 0 },
    { label: "Open matches", value: openMatches.count ?? 0 },
    { label: "Pending verification", value: pendingVerif.count ?? 0 },
    { label: "Suspended / banned", value: restricted.count ?? 0, accent: (restricted.count ?? 0) > 0 },
  ];

  let recentActions: { id: string; action: string; created_at: string; detail: string | null }[] = [];
  if (role === "superadmin") {
    const { data } = await admin
      .from("admin_actions")
      .select("id, action, created_at, detail")
      .order("created_at", { ascending: false })
      .limit(10);
    recentActions = data ?? [];
  }

  // Currently / recently active players — proxied by a last-seen heartbeat the
  // app shell writes on page load (Klimr has no live socket presence).
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const since = new Date(now - 15 * 60_000).toISOString();
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
              style={{ borderColor: s.accent ? "#ff4e1b" : "#e4e4e7" }}
            >
              <div className="kicker text-faint">{s.label}</div>
              <div className="mt-1 font-display text-4xl leading-none" style={{ color: s.accent ? "#d63a0f" : "#0a0a0b" }}>
                {s.value.toLocaleString("en-US")}
              </div>
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

      <div className="mt-7">
        <div className="kicker mb-3 flex items-center gap-2 text-faint">
          <span className="h-2 w-2 rounded-full" style={{ background: active.some((u) => isOnline(u.last_seen_at)) ? "#16a34a" : "#a1a1aa" }} />
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
                className="lift flex items-center gap-2 rounded-full border border-rule bg-surface px-3 py-1.5 text-sm"
              >
                <span className="h-1.5 w-1.5 rounded-full" style={{ background: isOnline(u.last_seen_at) ? "#16a34a" : "#d4d4d8" }} />
                <span className="font-semibold text-ink">{u.display_name || "Player"}</span>
                <span className="text-xs text-faint">{rel(u.last_seen_at)}</span>
              </Link>
            ))}
          </div>
        )}
      </div>

      {role === "superadmin" ? (
        <div className="mt-8">
          <div className="kicker mb-3 text-faint">Recent staff actions</div>
          {recentActions.length === 0 ? (
            <p className="text-sm text-mute">No actions recorded yet.</p>
          ) : (
            <div className="space-y-1.5">
              {recentActions.map((a) => (
                <div key={a.id} className="flex items-center justify-between rounded-xl border border-rule bg-surface px-4 py-2.5 text-sm">
                  <span className="font-mono text-ink">{a.action}</span>
                  <span className="text-faint">{new Date(a.created_at).toLocaleString("en-US")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
