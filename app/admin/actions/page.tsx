import { Search } from "lucide-react";
import { BackButton } from "@/components/back-button";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";

export const metadata = { title: "Staff actions · Admin" };

type ActionRow = { id: string; action: string; created_at: string; detail: string | null; actor_id: string | null; target_ref: string | null };

export default async function AdminActionsLog({ searchParams }: { searchParams: Promise<{ q?: string }> }) {
  await requireAdmin("superadmin");
  const { q } = await searchParams;
  const admin = createAdminClient();

  let query = admin
    .from("admin_actions")
    .select("id, action, created_at, detail, actor_id, target_ref")
    .order("created_at", { ascending: false })
    .limit(500);
  const term = (q ?? "").trim().replace(/[%,()]/g, "");
  if (term) query = query.or(`action.ilike.%${term}%,detail.ilike.%${term}%,target_ref.ilike.%${term}%`);

  const { data: rows } = await query;
  const actions = (rows as ActionRow[] | null) ?? [];

  const ids = [...new Set(actions.map((a) => a.actor_id).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: ps } = await admin.from("profiles").select("id, display_name").in("id", ids);
    for (const p of (ps as { id: string; display_name: string }[] | null) ?? []) names.set(p.id, p.display_name);
  }

  return (
    <div>
      <BackButton fallback="/admin" label="Overview" className="press mb-4 inline-flex items-center gap-1 text-sm font-semibold text-mute transition-colors hover:text-ink" />

      <div className="mb-4">
        <h2 className="font-display text-2xl text-ink">Staff actions</h2>
        <p className="mt-1 text-sm text-mute">The full audit trail of staff actions. Newest first, up to 500.</p>
      </div>

      <form method="get" className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search action, detail, or target…"
            className="w-full rounded-xl border border-rule bg-surface shadow-e1 py-2.5 pl-9 pr-3 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
          />
        </div>
        <button className="press rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft">Search</button>
      </form>

      <p className="mb-3 text-xs text-faint">{actions.length} {actions.length === 1 ? "action" : "actions"}{term ? ` matching “${term}”` : ""}</p>

      <div className="space-y-1.5">
        {actions.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-rule bg-bg/40 px-4 py-10 text-center text-sm text-mute">No actions{term ? " match your search" : " recorded yet"}.</p>
        ) : (
          actions.map((a) => (
            <div key={a.id} className="rounded-xl border border-rule bg-surface shadow-e1 px-4 py-2.5 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="font-mono text-ink">{a.action}</span>
                <span className="shrink-0 text-faint">{new Date(a.created_at).toLocaleString("en-US")}</span>
              </div>
              {a.detail || a.actor_id || a.target_ref ? (
                <p className="mt-0.5 text-xs text-mute">
                  {a.detail ?? ""}
                  {a.target_ref ? `${a.detail ? " · " : ""}${a.target_ref}` : ""}
                  {a.actor_id ? `${a.detail || a.target_ref ? " · " : ""}by ${names.get(a.actor_id) ?? "—"}` : ""}
                </p>
              ) : null}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
