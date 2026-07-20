import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { HistoryList, type HistoryRow } from "@/components/history-list";

export const metadata: Metadata = { title: "Past classes · Klimr" };

const nowMs = () => Date.now();
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });

export default async function PastClassesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/classes/past");
  const uid = user.id;
  const now = nowMs();

  const [{ data: enr }, { data: hosted }] = await Promise.all([
    supabase.from("class_enrollments").select("class_id").eq("user_id", uid).neq("status", "cancelled"),
    supabase.from("classes").select("id, title, sport_key, status, provider_id").eq("provider_id", uid),
  ]);
  const enrolledIds = [...new Set((enr ?? []).map((r) => r.class_id))];
  const hostedRows = hosted ?? [];
  const hostedIds = new Set(hostedRows.map((c) => c.id));
  const needEnrolled = enrolledIds.filter((id) => !hostedIds.has(id));
  let enrolledRows: typeof hostedRows = [];
  if (needEnrolled.length) {
    const { data } = await supabase.from("classes").select("id, title, sport_key, status, provider_id").in("id", needEnrolled);
    enrolledRows = data ?? [];
  }
  const all = [...hostedRows, ...enrolledRows];
  const classIds = all.map((c) => c.id);
  const maxByClass = new Map<string, string>();
  const hasFuture = new Set<string>();
  if (classIds.length) {
    const { data: sess } = await supabase.from("class_sessions").select("class_id, starts_at, status").in("class_id", classIds);
    for (const s of sess ?? []) {
      const prev = maxByClass.get(s.class_id);
      if (!prev || s.starts_at > prev) maxByClass.set(s.class_id, s.starts_at);
      if (s.status === "scheduled" && new Date(s.starts_at).getTime() >= now) hasFuture.add(s.class_id);
    }
  }
  const rows: HistoryRow[] = all
    .filter((c) => c.status === "cancelled" || c.status === "ended" || c.status === "completed" || (!hasFuture.has(c.id) && maxByClass.has(c.id)))
    .sort((a, b) => (maxByClass.get(b.id) ?? "").localeCompare(maxByClass.get(a.id) ?? ""))
    .map((c) => {
      const meta = sportMeta(c.sport_key);
      const last = maxByClass.get(c.id);
      return {
        id: c.id,
        href: `/classes/${c.id}`,
        sportKey: c.sport_key,
        title: c.title,
        sub: `${last ? fmtDate(last) : "No sessions"} · ${meta.name}`,
        role: c.provider_id === uid ? "Host" : "Attended",
        cancelled: c.status === "cancelled",
      };
    });

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <Breadcrumbs items={[{ label: "Classes & Coaching", href: "/classes" }, { label: "Past classes" }]} />
      <Link href="/classes" className="press inline-flex items-center gap-1.5 text-sm text-mute transition-colors hover:text-ink">
        <ArrowLeft size={15} /> Classes &amp; Coaching
      </Link>
      <div className="mb-6 mt-4">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-flame-text">Classes — History</p>
        <h1 className="mt-1.5 font-display text-[40px] font-bold leading-none tracking-[-0.025em] text-ink">Past classes</h1>
        <p className="mt-1 text-sm text-mute">Classes you taught or took, with their final session dates.</p>
      </div>
      <HistoryList rows={rows} emptyText="Classes you teach or take will show up here once they've finished." />
    </div>
  );
}
