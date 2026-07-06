import Link from "next/link";
import { Sparkles, Mail, ChevronRight } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";

export const metadata = { title: "Support · Admin" };

// The support queue: every ticket from the contact form and the AI assistant,
// newest first within status. Reads are indexed on (status, created_at) —
// never a table scan, whatever the ticket volume grows to.

const FILTERS = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In progress" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
];

const STATUS_TONE: Record<string, string> = {
  open: "#d63a0f",
  in_progress: "#b8860b",
  resolved: "#16a34a",
  closed: "#71717a",
};

export default async function AdminSupport({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin("support");
  const { status: raw } = await searchParams;
  const status = FILTERS.some((f) => f.key === raw) ? (raw as string) : "open";

  const admin = createAdminClient();
  let query = admin
    .from("support_tickets")
    .select("id, user_id, source, category, severity, status, subject, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (status !== "all") query = query.eq("status", status);
  const { data: tickets } = await query;

  const userIds = Array.from(new Set((tickets ?? []).map((t) => t.user_id)));
  const { data: profs } = userIds.length
    ? await admin.from("profiles").select("id, display_name").in("id", userIds)
    : { data: [] as { id: string; display_name: string }[] };
  const nameOf = new Map((profs ?? []).map((p) => [p.id, p.display_name]));

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-extrabold text-ink">Support queue</h2>
          <p className="text-sm text-mute">Tickets from the contact form and the AI assistant.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {FILTERS.map((f) => (
            <Link
              key={f.key}
              href={f.key === "open" ? "/admin/support" : `/admin/support?status=${f.key}`}
              className={`press rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                status === f.key ? "bg-ink text-white" : "text-mute hover:bg-[#f4f4f5] hover:text-ink"
              }`}
            >
              {f.label}
            </Link>
          ))}
        </div>
      </div>

      {tickets && tickets.length ? (
        <ul className="overflow-hidden rounded-2xl border border-rule bg-surface">
          {tickets.map((t, i) => (
            <li key={t.id} className={i > 0 ? "border-t border-rule" : ""}>
              <Link href={`/admin/support/${t.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-bg">
                <span aria-hidden className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ background: STATUS_TONE[t.status] ?? "#71717a" }} />
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-[#f4f4f5] text-mute">
                  {t.source === "ai_chat" ? <Sparkles size={15} /> : <Mail size={15} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold text-ink">{t.subject}</span>
                    {t.severity === "urgent" ? (
                      <span className="shrink-0 rounded-full bg-[#fdeceb] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[#c0271d]">Urgent</span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block truncate text-xs text-faint">
                    {nameOf.get(t.user_id) ?? "Unknown member"} · {t.category} ·{" "}
                    {new Date(t.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </span>
                </span>
                <ChevronRight size={16} className="shrink-0 text-faint" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="rounded-2xl border border-dashed border-rule bg-surface p-8 text-center">
          <p className="text-sm font-semibold text-ink">No {status === "all" ? "" : `${status.replace("_", " ")} `}tickets.</p>
          <p className="mt-1 text-sm text-mute">New requests from the form and the assistant land here.</p>
        </div>
      )}
    </div>
  );
}
