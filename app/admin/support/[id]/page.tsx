import Link from "next/link";
import { notFound } from "next/navigation";
import { Sparkles, Mail, User } from "lucide-react";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { setTicketStatus, saveTicketNote } from "../actions";

export const metadata = { title: "Ticket · Admin" };

const STATUSES: { key: string; label: string }[] = [
  { key: "open", label: "Open" },
  { key: "in_progress", label: "In progress" },
  { key: "resolved", label: "Resolved" },
  { key: "closed", label: "Closed" },
];

export default async function AdminTicket({ params }: { params: Promise<{ id: string }> }) {
  await requireAdmin("support");
  const { id } = await params;
  const admin = createAdminClient();

  const { data: t } = await admin
    .from("support_tickets")
    .select("id, user_id, source, category, severity, status, subject, body, ai_summary, conversation_id, admin_note, created_at")
    .eq("id", id)
    .maybeSingle();
  if (!t) notFound();

  const [{ data: prof }, { data: authUser }] = await Promise.all([
    admin.from("profiles").select("display_name, account_status, verification_status").eq("id", t.user_id).maybeSingle(),
    admin.auth.admin.getUserById(t.user_id),
  ]);

  const { data: transcript } = t.conversation_id
    ? await admin
        .from("support_messages")
        .select("id, role, content, created_at")
        .eq("conversation_id", t.conversation_id)
        .order("id", { ascending: true })
        .limit(200)
    : { data: null };

  return (
    <div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-lg font-extrabold text-ink">{t.subject}</h2>
            {t.severity === "urgent" ? (
              <span className="rounded-full bg-tint-danger px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-danger">Urgent</span>
            ) : null}
          </div>
          <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-faint">
            {t.source === "ai_chat" ? <Sparkles size={11} /> : <Mail size={11} />}
            {t.source === "ai_chat" ? "Escalated by the assistant" : "Contact form"} · {t.category} ·{" "}
            {new Date(t.created_at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}
          </p>
        </div>
        <form action={setTicketStatus} className="flex flex-wrap gap-1.5">
          <input type="hidden" name="ticketId" value={t.id} />
          {STATUSES.map((s) => (
            <button
              key={s.key}
              name="status"
              value={s.key}
              disabled={t.status === s.key}
              className={`press rounded-full px-3 py-1.5 text-sm font-semibold transition-colors ${
                t.status === s.key ? "bg-ink text-white" : "border border-rule text-mute hover:text-ink"
              }`}
            >
              {s.label}
            </button>
          ))}
        </form>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
        <div className="space-y-4">
          {t.body ? (
            <div className="rounded-2xl border border-rule bg-surface shadow-e1 p-5">
              <p className="kicker mb-2 text-faint">Message</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{t.body}</p>
            </div>
          ) : null}

          {t.ai_summary ? (
            <div className="rounded-2xl border border-rule bg-surface shadow-e1 p-5">
              <p className="kicker mb-2 flex items-center gap-1 text-faint"><Sparkles size={11} /> Assistant&rsquo;s summary for you</p>
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink">{t.ai_summary}</p>
            </div>
          ) : null}

          {transcript && transcript.length ? (
            <div className="rounded-2xl border border-rule bg-surface shadow-e1 p-5">
              <p className="kicker mb-3 text-faint">Full conversation transcript</p>
              <div className="space-y-2.5">
                {transcript.map((m) =>
                  m.role === "user" ? (
                    <div key={m.id} className="flex justify-end">
                      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-ink px-3.5 py-2 text-sm leading-relaxed text-white">{m.content}</div>
                    </div>
                  ) : (
                    <div key={m.id} className="flex justify-start">
                      <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tl-md border border-rule bg-bg px-3.5 py-2 text-sm leading-relaxed text-ink">{m.content}</div>
                    </div>
                  ),
                )}
              </div>
            </div>
          ) : null}

          <div className="rounded-2xl border border-rule bg-surface shadow-e1 p-5">
            <p className="kicker mb-2 text-faint">Private note</p>
            <form action={saveTicketNote}>
              <input type="hidden" name="ticketId" value={t.id} />
              <textarea
                name="note"
                rows={3}
                maxLength={2000}
                defaultValue={t.admin_note ?? ""}
                placeholder="Notes for the team — the member never sees this."
                className="w-full resize-none rounded-xl border border-rule bg-bg px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-ink/40"
              />
              <button className="press mt-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-white">Save note</button>
            </form>
          </div>
        </div>

        <aside className="rounded-2xl border border-rule bg-surface shadow-e1 p-5">
          <p className="kicker mb-3 flex items-center gap-1 text-faint"><User size={11} /> Member</p>
          <p className="text-sm font-bold text-ink">{prof?.display_name ?? "Unknown"}</p>
          <p className="mt-0.5 break-all text-xs text-mute">{authUser?.user?.email ?? "no email on file"}</p>
          <dl className="mt-3 space-y-1.5 text-xs">
            <div className="flex justify-between gap-2"><dt className="text-faint">Account</dt><dd className="font-semibold text-ink">{prof?.account_status ?? "—"}</dd></div>
            <div className="flex justify-between gap-2"><dt className="text-faint">Verification</dt><dd className="font-semibold text-ink">{prof?.verification_status ?? "—"}</dd></div>
          </dl>
          <Link href={`/admin/users?q=${encodeURIComponent(prof?.display_name ?? "")}`} className="press mt-4 inline-block rounded-full border border-rule px-3.5 py-1.5 text-xs font-semibold text-mute hover:text-ink">
            Open in Users
          </Link>
        </aside>
      </div>
    </div>
  );
}
