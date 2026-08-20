import Link from "next/link";
import { Search, Archive } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";
import { sportMeta } from "@/lib/sports";

export const metadata = { title: "Users · Admin" };

type Row = {
  id: string;
  display_name: string;
  city: string | null;
  state: string | null;
  verification_status: string;
  account_status: string;
  last_seen_at: string | null;
};

const STATUS_TONE: Record<string, string> = { active: "var(--color-success)", suspended: "var(--color-warning)", banned: "var(--color-brand-deep)" };

/** Signup windows for the recent-signups section. */
const SIGNUP_WINDOWS = [
  { key: "24", hours: 24, chip: "24H", human: "24 hours" },
  { key: "48", hours: 48, chip: "48H", human: "48 hours" },
  { key: "72", hours: 72, chip: "72H", human: "72 hours" },
  { key: "168", hours: 168, chip: "7D", human: "7 days" },
  { key: "720", hours: 720, chip: "30D", human: "30 days" },
] as const;

type SignupRow = {
  id: string;
  display_name: string;
  city: string | null;
  state: string | null;
  primary_sport: string | null;
  verification_status: string;
  created_at: string;
};

/** Compact relative age for admin lists ("3h ago", "6d ago"). */
function joinedAgo(iso: string, nowMs: number): string {
  const mins = Math.max(1, Math.round((nowMs - Date.parse(iso)) / 60_000));
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 48) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string; verification?: string; status?: string; signups?: string }> }) {
  await requireAdmin("support");
  const { q, verification, status, signups } = await searchParams;
  const admin = createAdminClient();

  let query = admin
    .from("profiles")
    .select("id, display_name, city, state, verification_status, account_status, last_seen_at")
    .neq("account_status", "archived");
  if (verification === "pending" || verification === "verified" || verification === "unverified") {
    query = query.eq("verification_status", verification);
  }
  if (status === "restricted") {
    query = query.in("account_status", ["suspended", "banned"]);
  }
  const { data } = q
    ? await query.ilike("display_name", `%${q}%`).limit(40)
    : await query.order("created_at", { ascending: false }).limit(25);
  const rows = (data as Row[] | null) ?? [];
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const onlineCutoff = nowMs - 5 * 60_000;

  // Recent signups, windowed: 24h / 48h / 72h / 7d / 30d.
  const win = SIGNUP_WINDOWS.find((w) => w.key === signups) ?? SIGNUP_WINDOWS[0];
  const sinceIso = new Date(nowMs - win.hours * 3_600_000).toISOString();
  const { data: signupData, count: signupCount } = await admin
    .from("profiles")
    .select("id, display_name, city, state, primary_sport, verification_status, created_at", { count: "exact" })
    .gte("created_at", sinceIso)
    .neq("account_status", "archived")
    .order("created_at", { ascending: false })
    .limit(60);
  const signupRows = (signupData as SignupRow[] | null) ?? [];

  return (
    <div>
      <form action="/admin/users" method="get" className="flex items-center gap-2">
        <div className="flex flex-1 items-center gap-2 rounded-full border border-rule bg-surface px-4 py-2">
          <Search size={16} className="text-faint" />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search players by name…"
            className="min-w-0 flex-1 bg-transparent text-sm text-ink outline-none placeholder:text-faint"
          />
        </div>
        <button type="submit" className="press rounded-lg bg-ink px-4 py-2 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft">Search</button>
      </form>

      <section className="mt-5 rounded-[14px] border border-rule bg-white p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-faint">Recent signups</p>
          <div className="flex items-center gap-1.5">
            {SIGNUP_WINDOWS.map((w) => (
              <Link
                key={w.key}
                href={`/admin/users?signups=${w.key}`}
                className={`press rounded-[9px] border px-2.5 py-1 font-mono text-[10.5px] font-bold tracking-[0.08em] ${
                  w.key === win.key ? "border-ink bg-ink text-surface" : "border-rule bg-surface text-mute hover:border-ink hover:text-ink"
                }`}
              >
                {w.chip}
              </Link>
            ))}
          </div>
        </div>
        <p className="mt-2 text-xs text-mute">
          <span className="font-bold text-ink">{signupCount ?? signupRows.length}</span> new {(signupCount ?? signupRows.length) === 1 ? "player" : "players"} in the last {win.human}
          {(signupCount ?? 0) > signupRows.length ? ` — showing the newest ${signupRows.length}` : ""}
        </p>
        {signupRows.length === 0 ? (
          <p className="mt-3 rounded-xl border border-dashed border-rule bg-surface px-4 py-5 text-center text-sm text-mute">No new signups in this window.</p>
        ) : (
          <div className="mt-3 grid gap-2">
            {signupRows.map((u) => (
              <Link key={u.id} href={`/admin/users/${u.id}`} className="lift flex items-center justify-between gap-3 rounded-xl border border-rule bg-surface px-4 py-2.5 shadow-e1">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-[10px] border border-rule bg-white font-mono text-[12px] font-bold text-ink">
                    {u.display_name.slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-bold text-ink">{u.display_name}</p>
                    <p className="truncate text-[11.5px] text-mute">
                      {[u.city, u.state].filter(Boolean).join(", ") || "—"}
                      {u.primary_sport ? ` · ${sportMeta(u.primary_sport).name}` : ""}
                    </p>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {u.verification_status === "pending" ? (
                    <span className="rounded-md bg-[#FFF4E0] px-1.5 py-0.5 font-mono text-floor font-bold tracking-[0.1em] text-[#9A6B00]">PENDING</span>
                  ) : null}
                  <span className="font-mono text-[11px] text-faint">{joinedAgo(u.created_at, nowMs)}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </section>

      <div className="mt-3 flex items-center justify-between">
        <span className="text-xs text-faint">{q ? `Results for “${q}”` : verification === "pending" ? "Pending verification" : verification ? `${verification} players` : status === "restricted" ? "Suspended & banned" : "Recently joined"}</span>
        <Link
          href="/admin/users/archived"
          className="press inline-flex items-center gap-1 text-xs font-semibold text-mute transition-colors hover:text-ink"
        >
          <Archive size={13} /> Archived accounts
        </Link>
      </div>

      <div className="mt-3 space-y-2">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-rule bg-surface shadow-e1 p-8 text-center text-sm text-mute">No players found.</div>
        ) : (
          rows.map((u) => (
            <Link key={u.id} href={`/admin/users/${u.id}`} className="lift flex items-center justify-between rounded-xl border border-rule bg-surface shadow-e1 px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-ink">{u.display_name || "Player"}</div>
                <div className="truncate text-xs text-faint">{[u.city, u.state].filter(Boolean).join(", ") || "—"}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {u.last_seen_at && Date.parse(u.last_seen_at) > onlineCutoff ? (
                  <span className="inline-flex items-center gap-1 kicker rounded-full bg-success/10 px-2 py-0.5 text-floor" style={{ color: "var(--color-success)" }}>
                    <span className="h-1.5 w-1.5 rounded-full" style={{ background: "var(--color-success)" }} /> online
                  </span>
                ) : null}
                {u.verification_status === "verified" ? <span className="kicker rounded-full bg-tint-brand px-2 py-0.5 text-floor text-brand-deep">verified</span> : null}
                {u.verification_status === "pending" ? <span className="kicker rounded-full px-2 py-0.5 text-floor" style={{ background: "var(--color-tint-brand)", color: "var(--color-brand-deep)" }}>pending</span> : null}
                {u.account_status !== "active" ? (
                  <span className="kicker rounded-full px-2 py-0.5 text-floor" style={{ background: "var(--color-bg)", color: STATUS_TONE[u.account_status] }}>{u.account_status}</span>
                ) : null}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
