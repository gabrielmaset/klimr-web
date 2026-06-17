import Link from "next/link";
import { Search } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";

export const metadata = { title: "Users · Admin" };

type Row = {
  id: string;
  display_name: string;
  city: string | null;
  state: string | null;
  verification_status: string;
  account_status: string;
};

const STATUS_TONE: Record<string, string> = { active: "#16a34a", suspended: "#b8860b", banned: "#d63a0f" };

export default async function AdminUsers({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin("support");
  const { q } = await searchParams;
  const admin = createAdminClient();

  const query = admin
    .from("profiles")
    .select("id, display_name, city, state, verification_status, account_status");
  const { data } = q
    ? await query.ilike("display_name", `%${q}%`).limit(40)
    : await query.order("created_at", { ascending: false }).limit(25);
  const rows = (data as Row[] | null) ?? [];

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
        <button className="press rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft">Search</button>
      </form>

      <div className="mt-3 text-xs text-faint">{q ? `Results for “${q}”` : "Recently joined"}</div>

      <div className="mt-3 space-y-2">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-rule bg-surface p-8 text-center text-sm text-mute">No players found.</div>
        ) : (
          rows.map((u) => (
            <Link key={u.id} href={`/admin/users/${u.id}`} className="lift flex items-center justify-between rounded-xl border border-rule bg-surface px-4 py-3">
              <div className="min-w-0">
                <div className="truncate text-sm font-bold text-ink">{u.display_name || "Player"}</div>
                <div className="truncate text-xs text-faint">{[u.city, u.state].filter(Boolean).join(", ") || "—"}</div>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {u.verification_status === "verified" ? <span className="kicker rounded-full bg-tint-brand px-2 py-0.5 text-[9px] text-brand-deep">verified</span> : null}
                {u.account_status !== "active" ? (
                  <span className="kicker rounded-full px-2 py-0.5 text-[9px]" style={{ background: "#f4f4f5", color: STATUS_TONE[u.account_status] }}>{u.account_status}</span>
                ) : null}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}
