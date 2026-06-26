import Link from "next/link";
import { RotateCcw, Trash2 } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";
import { recoverUser, purgeUserNow } from "../../actions";

export const metadata = { title: "Archived accounts · Admin" };

type Row = {
  id: string;
  display_name: string;
  city: string | null;
  state: string | null;
  archived_at: string | null;
};

const PURGE_DAYS = 30;

export default async function ArchivedAccountsPage() {
  const { role } = await requireAdmin("admin");
  const canManage = role === "superadmin";
  const admin = createAdminClient();

  const { data } = await admin
    .from("profiles")
    .select("id, display_name, city, state, archived_at")
    .eq("account_status", "archived")
    .order("archived_at", { ascending: true });
  const rows = (data as Row[] | null) ?? [];

  // Server component: one clock read per request is stable.
  // eslint-disable-next-line react-hooks/purity
  const now = Date.now();
  const daysLeft = (archivedAt: string | null): number | null => {
    if (!archivedAt) return null;
    const purgeAt = new Date(archivedAt).getTime() + PURGE_DAYS * 86_400_000;
    return Math.max(0, Math.ceil((purgeAt - now) / 86_400_000));
  };

  return (
    <div>
      <BackButton fallback="/admin/users" label="Users" className="press mb-5 inline-flex items-center gap-1 text-sm font-semibold text-mute hover:text-ink" size={15} />

      <h1 className="font-display text-3xl text-ink sm:text-4xl">Archived accounts</h1>
      <p className="mt-1 text-sm text-mute">
        Archived accounts are hidden and permanently deleted {PURGE_DAYS} days after archiving. Recover one to
        restore full access, or purge it now.
      </p>

      <div className="mt-6 space-y-2">
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-rule bg-surface p-8 text-center text-sm text-mute">
            No archived accounts.
          </div>
        ) : (
          rows.map((u) => {
            const left = daysLeft(u.archived_at);
            return (
              <div
                key={u.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-rule bg-surface px-4 py-3"
              >
                <div className="min-w-0">
                  <Link
                    href={`/admin/users/${u.id}`}
                    className="truncate text-sm font-bold text-ink transition-colors hover:text-brand-deep"
                  >
                    {u.display_name || "Player"}
                  </Link>
                  <div className="truncate text-xs text-faint">
                    {[u.city, u.state].filter(Boolean).join(", ") || "—"}
                    {u.archived_at
                      ? ` · archived ${new Date(u.archived_at).toLocaleDateString("en-US", { dateStyle: "medium" })}`
                      : ""}
                    {left != null ? ` · ${left === 0 ? "purges today" : `${left} day${left === 1 ? "" : "s"} left`}` : ""}
                  </div>
                </div>
                {canManage ? (
                  <div className="flex shrink-0 items-center gap-1.5">
                    <form action={recoverUser}>
                      <input type="hidden" name="userId" value={u.id} />
                      <button className="press inline-flex items-center gap-1.5 rounded-full border border-rule px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-faint">
                        <RotateCcw size={13} /> Recover
                      </button>
                    </form>
                    <form action={purgeUserNow}>
                      <input type="hidden" name="userId" value={u.id} />
                      <button className="press inline-flex items-center gap-1.5 rounded-full border border-rule px-3 py-1.5 text-xs font-semibold text-mute transition-colors hover:border-brand/40 hover:text-brand-deep">
                        <Trash2 size={13} /> Purge now
                      </button>
                    </form>
                  </div>
                ) : (
                  <span className="text-xs text-faint">superadmin only</span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
