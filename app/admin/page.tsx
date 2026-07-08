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
    { label: "Pending verification", value: pendingVerif.count ?? 0, href: "/admin/users?verification=pending", accent: (pendingVerif.count ?? 0) > 0 },
    { label: "Suspended / banned", value: restricted.count ?? 0, href: "/admin/users?status=restricted", accent: (restricted.count ?? 0) > 0 },
  ];

  let recentActions: { id: string; action: string; created_at: string; detail: string | null; actor_id: string | null }[] = [];
  const actorNames = new Map<string, string>();
  if (role === "superadmin") {
    const { data } = await admin
      .from("admin_actions")
      .select("id, action, created_at, detail, actor_id")
      .order("created_at", { ascending: false })
      .limit(100);
    recentActions = data ?? [];
    const ids = [...new Set(recentActions.map((a) => a.actor_id).filter((x): x is string => !!x))];
    if (ids.length) {
      const { data: ps } = await admin.from("profiles").select("id, display_name").in("id", ids);
      for (const x of (ps as { id: string; display_name: string }[] | null) ?? []) actorNames.set(x.id, x.display_name);
    }
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
              style={{ borderColor: s.accent ? "var(--color-brand)" : "var(--color-rule)" }}
            >
              <div className="kicker text-faint">{s.label}</div>
              <div className="mt-1 font-display text-4xl leading-none" style={{ color: s.accent ? "var(--color-brand-deep)" : "var(--color-ink)" }}>
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
                className="lift flex items-center gap-2 rounded-full border border-rule bg-surface px-3 py-1.5 text-sm"
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
          {recentActions.length === 0 ? (
            <p className="text-sm text-mute">No actions recorded yet.</p>
          ) : (
            <div className="max-h-[28rem] space-y-1.5 overflow-y-auto rounded-2xl border border-rule/60 bg-bg/30 p-2">
              {recentActions.map((a) => (
                <div key={a.id} className="rounded-xl border border-rule bg-surface shadow-e1 px-4 py-2.5 text-sm">
                  <div className="flex items-center justify-between gap-3">
                    <span className="font-mono text-ink">{a.action}</span>
                    <span className="shrink-0 text-faint">{new Date(a.created_at).toLocaleString("en-US")}</span>
                  </div>
                  {a.detail || a.actor_id ? (
                    <p className="mt-0.5 text-xs text-mute">
                      {a.detail ?? ""}
                      {a.actor_id ? `${a.detail ? " · " : ""}by ${actorNames.get(a.actor_id) ?? "—"}` : ""}
                    </p>
                  ) : null}
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}
