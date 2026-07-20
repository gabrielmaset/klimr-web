import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { HistoryList, type HistoryRow } from "@/components/history-list";

export const metadata: Metadata = { title: "Past tournaments · Klimr" };

const nowMs = () => Date.now();
const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });

export default async function PastTournamentsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/tournaments/past");
  const uid = user.id;
  const now = nowMs();

  const [{ data: mgr }, { data: reg }, { data: players }] = await Promise.all([
    supabase.from("tournament_managers").select("tournament_id").eq("user_id", uid),
    supabase.from("tournament_registrations").select("tournament_id").eq("registrant_id", uid),
    supabase.from("tournament_registration_players").select("tournament_id").eq("user_id", uid),
  ]);
  const mgrIds = new Set((mgr ?? []).map((r) => r.tournament_id));
  const involved = [
    ...new Set([...(mgr ?? []).map((r) => r.tournament_id), ...(reg ?? []).map((r) => r.tournament_id), ...(players ?? []).map((r) => r.tournament_id)]),
  ];
  let q = supabase.from("tournaments").select("id, code, title, sport_key, status, starts_at, location_name, cancelled_at, owner_id");
  q = involved.length ? q.or(`owner_id.eq.${uid},id.in.(${involved.join(",")})`) : q.eq("owner_id", uid);
  const { data: ts } = await q;

  const rows: HistoryRow[] = (ts ?? [])
    .filter((t) => !!t.cancelled_at || t.status === "completed" || (!!t.starts_at && new Date(t.starts_at).getTime() < now))
    .sort((a, b) => (b.starts_at ?? "").localeCompare(a.starts_at ?? ""))
    .map((t) => {
      const meta = sportMeta(t.sport_key);
      return {
        id: t.id,
        href: `/e/${t.code}`,
        sportKey: t.sport_key,
        title: t.title,
        sub: `${t.starts_at ? fmtDate(t.starts_at) : ""} · ${meta.name}${t.location_name ? ` · ${t.location_name}` : ""}`,
        role: t.owner_id === uid ? "Organizer" : mgrIds.has(t.id) ? "Admin" : "Registered",
        cancelled: !!t.cancelled_at,
      };
    });

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <Breadcrumbs items={[{ label: "Tournaments", href: "/tournaments" }, { label: "Past tournaments" }]} />
      <Link href="/tournaments" className="press inline-flex items-center gap-1.5 text-sm text-mute transition-colors hover:text-ink">
        <ArrowLeft size={15} /> Tournaments
      </Link>
      <div className="mb-6 mt-4">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-flame-text">Tournaments — History</p>
        <h1 className="mt-1.5 font-display text-[40px] font-bold leading-none tracking-[-0.025em] text-ink">Past tournaments</h1>
        <p className="mt-1 text-sm text-mute">Every tournament you organized, helped run, or entered — results and standings stay reachable.</p>
      </div>
      <HistoryList rows={rows} emptyText="Tournaments you organize, help run, or enter will show up here once they're over." />
    </div>
  );
}
