import { CircleAlert, TriangleAlert, Info, Search } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";

export const metadata = { title: "Diagnostics · Admin" };

const LEVEL = {
  error: { Icon: CircleAlert, cls: "text-brand-deep", tint: "bg-tint-brand" },
  warn: { Icon: TriangleAlert, cls: "text-warning", tint: "bg-tint-warning" },
  info: { Icon: Info, cls: "text-mute", tint: "bg-bg" },
} as const;

type LogRow = {
  id: string;
  user_id: string | null;
  level: string;
  message: string;
  detail: string | null;
  url: string | null;
  user_agent: string | null;
  created_at: string;
};

export default async function AdminDiagnostics({ searchParams }: { searchParams: Promise<{ q?: string; level?: string }> }) {
  await requireAdmin("support");
  const { q, level } = await searchParams;
  const admin = createAdminClient();

  let query = admin
    .from("error_logs")
    .select("id, user_id, level, message, detail, url, user_agent, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  const lvl = level === "error" || level === "warn" || level === "info" ? level : "";
  if (lvl) query = query.eq("level", lvl);
  const term = (q ?? "").trim().replace(/[%,()]/g, "");
  if (term) query = query.or(`message.ilike.%${term}%,url.ilike.%${term}%,detail.ilike.%${term}%`);

  const { data: rows } = await query;
  const logs = (rows as LogRow[] | null) ?? [];

  const ids = [...new Set(logs.map((l) => l.user_id).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (ids.length) {
    const { data: ps } = await admin.from("profiles").select("id, display_name").in("id", ids);
    for (const p of (ps as { id: string; display_name: string }[] | null) ?? []) names.set(p.id, p.display_name);
  }

  return (
    <div>
      <div className="mb-4">
        <h2 className="font-display text-2xl text-ink">Diagnostics &amp; logs</h2>
        <p className="mt-1 text-sm text-mute">Errors and warnings reported by any user&rsquo;s browser. Newest first, up to 200.</p>
      </div>

      <form method="get" className="mb-5 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search message, URL, or details…"
            className="w-full rounded-xl border border-rule bg-surface py-2.5 pl-9 pr-3 text-sm text-ink outline-none focus:border-brand"
          />
        </div>
        <select name="level" defaultValue={lvl} className="rounded-xl border border-rule bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-brand">
          <option value="">All levels</option>
          <option value="error">Errors</option>
          <option value="warn">Warnings</option>
          <option value="info">Info</option>
        </select>
        <button className="press rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft">Search</button>
      </form>

      <p className="mb-3 text-xs text-faint">{logs.length} {logs.length === 1 ? "entry" : "entries"}{term ? ` matching “${term}”` : ""}</p>

      <div className="space-y-2">
        {logs.length === 0 ? (
          <p className="rounded-2xl border border-dashed border-rule bg-bg/40 px-4 py-10 text-center text-sm text-mute">No logs{term ? " match your search" : " yet"}.</p>
        ) : (
          logs.map((e) => {
            const meta = LEVEL[(e.level as keyof typeof LEVEL)] ?? LEVEL.info;
            return (
              <div key={e.id} className="rounded-2xl border border-rule bg-surface p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-lg ${meta.tint} ${meta.cls}`}>
                    <meta.Icon size={13} />
                  </span>
                  <span className={`text-xs font-bold uppercase tracking-wide ${meta.cls}`}>{e.level}</span>
                  <span className="text-xs text-mute">{e.user_id ? names.get(e.user_id) ?? "Player" : "Signed-out"}</span>
                  <span className="ml-auto text-[11px] text-faint">{new Date(e.created_at).toLocaleString("en-US")}</span>
                </div>
                <p className="mt-1.5 break-words text-sm text-ink">{e.message}</p>
                {e.url ? <p className="mt-0.5 text-[11px] text-faint">{e.url}</p> : null}
                {e.detail || e.user_agent ? (
                  <details className="mt-1.5">
                    <summary className="cursor-pointer text-xs font-medium text-mute hover:text-ink">Details</summary>
                    <pre className="mt-1 max-h-60 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-bg/60 p-2 text-[11px] leading-relaxed text-ink-soft">{e.detail ?? ""}{e.user_agent ? `\n\n— ${e.user_agent}` : ""}</pre>
                  </details>
                ) : null}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
