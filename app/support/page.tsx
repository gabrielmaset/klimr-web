import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronLeft, LifeBuoy, Clock, CheckCircle2, CircleDot, Sparkles, BookOpen } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { SupportForm } from "./SupportForm";
import { SupportChat } from "@/components/support-chat";

export const metadata: Metadata = { title: "Contact support" };

const STATUS_META: Record<string, { label: string; cls: string }> = {
  open: { label: "Open", cls: "bg-tint-brand text-brand-deep" },
  in_progress: { label: "In progress", cls: "bg-[#fdf6e3] text-[#a16207]" },
  resolved: { label: "Resolved", cls: "bg-tint-success text-success" },
  closed: { label: "Closed", cls: "bg-[#f4f4f5] text-mute" },
};

export default async function SupportPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/support");

  const admin = createAdminClient();
  const { data: tickets } = await admin
    .from("support_tickets")
    .select("id, subject, category, status, source, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(8);

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <Link href="/help" className="press mb-5 inline-flex items-center gap-1 text-sm font-semibold text-mute hover:text-ink">
        <ChevronLeft size={15} /> Help center
      </Link>

      <div className="mb-7 flex items-start gap-3">
        <span className="mt-1 grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-tint-brand text-brand-deep">
          <LifeBuoy size={20} />
        </span>
        <div>
          <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Contact support</h1>
          <p className="mt-2 text-sm text-mute">
            Send the team a note — we reply by email, and your request&rsquo;s status shows here.
          </p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        <div className="rounded-2xl border border-rule bg-surface p-5 sm:p-6">
          <SupportForm email={user.email ?? ""} />
        </div>

        <aside className="space-y-4">
          <div className="rounded-2xl border border-rule bg-surface p-5">
            <p className="kicker text-faint">Your recent requests</p>
            {tickets && tickets.length ? (
              <ul className="mt-3 divide-y divide-rule">
                {tickets.map((t) => {
                  const s = STATUS_META[t.status] ?? STATUS_META.open;
                  return (
                    <li key={t.id} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-ink">{t.subject}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-faint">
                          {t.source === "ai_chat" ? <Sparkles size={10} /> : <CircleDot size={10} />}
                          {t.source === "ai_chat" ? "Via assistant" : "Via form"} · {new Date(t.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${s.cls}`}>{s.label}</span>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="mt-2 text-sm text-mute">Nothing yet — requests you send (or the assistant escalates) appear here with their status.</p>
            )}
          </div>

          <div className="rounded-2xl border border-rule bg-surface p-5">
            <p className="flex items-center gap-1.5 text-sm font-bold text-ink"><Clock size={14} className="text-brand-deep" /> Response time</p>
            <p className="mt-1 text-sm text-mute">Usually within a day. Safety reports are prioritized and reviewed first.</p>
            <p className="mt-3 flex items-center gap-1.5 text-sm font-bold text-ink"><CheckCircle2 size={14} className="text-success" /> Faster answers</p>
            <p className="mt-1 text-sm text-mute">
              The assistant solves most how-to questions instantly, and the{" "}
              <Link href="/help" className="font-semibold text-brand-deep underline underline-offset-2 hover:text-brand">help center</Link>{" "}
              covers every feature.
            </p>
          </div>

          <Link href="/help" className="press flex items-center gap-3 rounded-2xl border border-rule bg-surface p-4 transition-colors hover:border-ink/25">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-[#eef7ee] text-[#166534]"><BookOpen size={17} /></span>
            <span>
              <span className="block text-sm font-bold text-ink">Browse the help center</span>
              <span className="block text-xs text-mute">Guides and answers for every feature</span>
            </span>
          </Link>
        </aside>
      </div>

      <SupportChat />
    </div>
  );
}
