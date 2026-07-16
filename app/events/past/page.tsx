import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { HistoryList, type HistoryRow } from "@/components/history-list";

export const metadata: Metadata = { title: "Past events · Klimr" };

const WINDOW_DAYS = 30;
const nowMs = () => Date.now();
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });

export default async function PastEventsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/events/past");
  const uid = user.id;
  const now = nowMs();
  const floor = now - WINDOW_DAYS * 86_400_000;

  const [{ data: mgr }, { data: going }] = await Promise.all([
    supabase.from("event_managers").select("event_id").eq("user_id", uid),
    supabase.from("event_rsvps").select("event_id").eq("user_id", uid).eq("status", "going"),
  ]);
  const adminIds = new Set((mgr ?? []).map((r) => r.event_id));
  const involved = [...new Set([...(mgr ?? []).map((r) => r.event_id), ...(going ?? []).map((r) => r.event_id)])];
  let q = supabase.from("events").select("id, title, sport_key, starts_at, location_text, status, created_by, recurrence");
  q = involved.length ? q.or(`created_by.eq.${uid},id.in.(${involved.join(",")})`) : q.eq("created_by", uid);
  const { data: evs } = await q;

  const rows: HistoryRow[] = (evs ?? [])
    .filter((e) => {
      const t = new Date(e.starts_at).getTime();
      if (t < floor || t >= now) return e.status === "cancelled" && t >= floor && t < now;
      return e.status === "cancelled" || !e.recurrence || e.recurrence === "none";
    })
    .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
    .map((e) => {
      const meta = sportMeta(e.sport_key);
      return {
        id: e.id,
        href: `/events/${e.id}`,
        sportKey: e.sport_key,
        title: e.title,
        sub: `${fmtDate(e.starts_at)} · ${meta.name}${e.location_text ? ` · ${e.location_text}` : ""}`,
        role: e.created_by === uid ? "Organizer" : adminIds.has(e.id) ? "Admin" : "Attended",
        cancelled: e.status === "cancelled",
      };
    });

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <Link href="/events" className="press inline-flex items-center gap-1.5 text-sm text-mute transition-colors hover:text-ink">
        <ArrowLeft size={15} /> Events
      </Link>
      <div className="mb-6 mt-4">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-flame-text">Events — History</p>
        <h1 className="mt-1.5 font-display text-[40px] font-bold leading-none tracking-[-0.025em] text-ink">Past events</h1>
        <p className="mt-1 text-sm text-mute">Events you hosted, helped run, or attended in the last {WINDOW_DAYS} days.</p>
      </div>
      <HistoryList rows={rows} emptyText={`Nothing in the last ${WINDOW_DAYS} days — events you host, help run, or attend will show up here once they've wrapped.`} />
    </div>
  );
}
