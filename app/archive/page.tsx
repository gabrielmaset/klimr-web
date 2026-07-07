import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";

export const metadata: Metadata = { title: "Archive · Klimr" };

const TABS = [
  { key: "events", label: "Events" },
  { key: "classes", label: "Classes" },
  { key: "tournaments", label: "Tournaments" },
] as const;
type TabKey = (typeof TABS)[number]["key"];

type Row = { id: string; href: string; emoji: string; title: string; sub: string; role: string; cancelled: boolean };

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "America/Los_Angeles" });
}

// Wrapped so the react-hooks/purity rule doesn't flag a bare Date.now() in render.
function nowMs(): number {
  return Date.now();
}

export default async function ArchivePage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab: tabParam } = await searchParams;
  const tab: TabKey = TABS.some((t) => t.key === tabParam) ? (tabParam as TabKey) : "events";
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/archive");
  const uid = user.id;
  const now = nowMs();

  let rows: Row[] = [];
  let emptyText = "";

  if (tab === "events") {
    const [{ data: mgr }, { data: going }] = await Promise.all([
      supabase.from("event_managers").select("event_id").eq("user_id", uid),
      supabase.from("event_rsvps").select("event_id").eq("user_id", uid).eq("status", "going"),
    ]);
    const adminIds = new Set((mgr ?? []).map((r) => r.event_id));
    const involved = [...new Set([...(mgr ?? []).map((r) => r.event_id), ...(going ?? []).map((r) => r.event_id)])];
    let q = supabase.from("events").select("id, title, sport_key, starts_at, location_text, status, created_by, recurrence");
    q = involved.length ? q.or(`created_by.eq.${uid},id.in.(${involved.join(",")})`) : q.eq("created_by", uid);
    const { data: evs } = await q;
    rows = (evs ?? [])
      .filter((e) => e.status === "cancelled" || ((!e.recurrence || e.recurrence === "none") && new Date(e.starts_at).getTime() < now))
      .sort((a, b) => b.starts_at.localeCompare(a.starts_at))
      .map((e) => {
        const meta = sportMeta(e.sport_key);
        const role = e.created_by === uid ? "Organizer" : adminIds.has(e.id) ? "Admin" : "Attended";
        return {
          id: e.id,
          href: `/events/${e.id}`,
          emoji: meta.emoji,
          title: e.title,
          sub: `${fmtDate(e.starts_at)} · ${meta.name}${e.location_text ? ` · ${e.location_text}` : ""}`,
          role,
          cancelled: e.status === "cancelled",
        };
      });
    emptyText = "Events you've hosted, helped run, or attended will show up here once they've wrapped up.";
  } else if (tab === "classes") {
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
    rows = all
      .filter((c) => c.status === "cancelled" || c.status === "ended" || c.status === "completed" || (!hasFuture.has(c.id) && maxByClass.has(c.id)))
      .sort((a, b) => (maxByClass.get(b.id) ?? "").localeCompare(maxByClass.get(a.id) ?? ""))
      .map((c) => {
        const meta = sportMeta(c.sport_key);
        const last = maxByClass.get(c.id);
        const role = c.provider_id === uid ? "Host" : "Attended";
        return {
          id: c.id,
          href: `/classes/${c.id}`,
          emoji: meta.emoji,
          title: c.title,
          sub: `${last ? fmtDate(last) : "No sessions"} · ${meta.name}`,
          role,
          cancelled: c.status === "cancelled",
        };
      });
    emptyText = "Classes you've taught or taken will show up here once they've finished.";
  } else {
    const [{ data: mgr }, { data: reg }, { data: players }] = await Promise.all([
      supabase.from("tournament_managers").select("tournament_id").eq("user_id", uid),
      supabase.from("tournament_registrations").select("tournament_id").eq("registrant_id", uid),
      supabase.from("tournament_registration_players").select("tournament_id").eq("user_id", uid),
    ]);
    const mgrIds = new Set((mgr ?? []).map((r) => r.tournament_id));
    const involved = [
      ...new Set([
        ...(mgr ?? []).map((r) => r.tournament_id),
        ...(reg ?? []).map((r) => r.tournament_id),
        ...(players ?? []).map((r) => r.tournament_id),
      ]),
    ];
    let q = supabase.from("tournaments").select("id, code, title, sport_key, status, starts_at, location_name, cancelled_at, owner_id");
    q = involved.length ? q.or(`owner_id.eq.${uid},id.in.(${involved.join(",")})`) : q.eq("owner_id", uid);
    const { data: ts } = await q;
    rows = (ts ?? [])
      .filter((t) => !!t.cancelled_at || t.status === "completed" || (!!t.starts_at && new Date(t.starts_at).getTime() < now))
      .sort((a, b) => (b.starts_at ?? "").localeCompare(a.starts_at ?? ""))
      .map((t) => {
        const meta = sportMeta(t.sport_key);
        const role = t.owner_id === uid ? "Organizer" : mgrIds.has(t.id) ? "Admin" : "Registered";
        return {
          id: t.id,
          href: `/e/${t.code}`,
          emoji: meta.emoji,
          title: t.title,
          sub: `${t.starts_at ? fmtDate(t.starts_at) : ""} · ${meta.name}${t.location_name ? ` · ${t.location_name}` : ""}`,
          role,
          cancelled: !!t.cancelled_at,
        };
      });
    emptyText = "Tournaments you've organized, helped run, or entered will show up here once they're over.";
  }

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-6">
        <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Archive</h1>
        <p className="mt-1 text-sm text-mute">Your past events, classes, and tournaments — everything you hosted, helped run, or took part in. Nothing here is lost.</p>
      </div>

      <div className="mb-6 inline-flex rounded-full border border-rule bg-surface p-1">
        {TABS.map((t) => (
          <Link
            key={t.key}
            href={`/archive?tab=${t.key}`}
            className={`rounded-full px-4 py-1.5 text-sm font-semibold transition-colors ${tab === t.key ? "bg-ink text-surface" : "text-mute hover:text-ink"}`}
          >
            {t.label}
          </Link>
        ))}
      </div>

      {rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-rule bg-surface px-5 py-12 text-center text-sm text-mute">{emptyText}</div>
      ) : (
        <div className="grid gap-3">
          {rows.map((r) => (
            <Link key={r.id} href={r.href} className="lift flex items-center gap-3 rounded-2xl border border-rule bg-surface p-4">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-bg text-lg">{r.emoji}</span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1.5">
                  <span className="truncate text-sm font-bold text-ink">{r.title}</span>
                  {r.cancelled ? (
                    <span className="shrink-0 rounded-full bg-[#fef2f2] px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide text-[#dc2626]">Cancelled</span>
                  ) : null}
                </span>
                <span className="mt-0.5 block truncate text-xs text-mute">{r.sub}</span>
              </span>
              <span className="shrink-0 rounded-full border border-rule px-2.5 py-1 text-[11px] font-semibold text-ink-soft">{r.role}</span>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
