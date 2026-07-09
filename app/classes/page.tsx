import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { GraduationCap, MapPin, Plus, CalendarDays } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta, sportSlug } from "@/lib/sports";
import { formatClassPrice, enrollmentLabel } from "@/lib/classes";
import { isApprovedProvider } from "@/app/classes/actions";
import { LocalTime } from "@/components/local-time";

export const metadata: Metadata = { title: "Classes & Coaching" };

type Cls = {
  id: string;
  title: string;
  sport_key: string;
  summary: string | null;
  status: string;
  is_paid: boolean;
  price_cents: number;
  price_basis: string;
  recurrence: string;
  location_name: string | null;
};

function PriceTag({ c }: { c: Cls }) {
  return (
    <span className="shrink-0 rounded-full bg-bg px-2.5 py-1 text-xs font-bold text-ink">
      {formatClassPrice(c.is_paid, c.price_cents, c.price_basis)}
    </span>
  );
}

function ClassCard({ c, nextStart }: { c: Cls; nextStart?: string }) {
  const m = sportMeta(c.sport_key);
  return (
    <Link href={`/classes/${c.id}`} className="lift block rounded-2xl border border-rule bg-surface shadow-e1 p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl text-xl" style={{ background: `color-mix(in oklab, var(--color-sport-${sportSlug(c.sport_key)}) 16%, transparent)` }}>{m.emoji}</span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="kicker text-brand-deep">{m.name}</span>
            {c.recurrence === "recurring" ? <span className="kicker text-faint">· Weekly</span> : null}
            {c.status === "draft" ? <span className="rounded-full bg-rule/60 px-1.5 text-[10px] font-bold text-mute">DRAFT</span> : null}
          </div>
          <div className="truncate text-sm font-bold text-ink">{c.title}</div>
          {c.summary ? <div className="truncate text-xs text-mute">{c.summary}</div> : null}
        </div>
        <PriceTag c={c} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mute">
        {nextStart ? (
          <span className="inline-flex items-center gap-1.5">
            <CalendarDays size={13} /> <LocalTime iso={nextStart} />
          </span>
        ) : (
          <span className="text-faint">No upcoming sessions</span>
        )}
        {c.location_name ? (
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={13} /> {c.location_name}
          </span>
        ) : null}
      </div>
    </Link>
  );
}

export default async function ClassesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/classes");

  const nowISO = new Date().toISOString();
  const provider = await isApprovedProvider(user.id);

  // Published classes + their next upcoming session.
  const { data: pub } = await supabase
    .from("classes")
    .select("id, title, sport_key, summary, status, is_paid, price_cents, price_basis, recurrence, location_name")
    .eq("status", "published")
    .order("created_at", { ascending: false })
    .limit(60);
  const published = (pub as Cls[] | null) ?? [];

  const nextByClass = new Map<string, string>();
  if (published.length) {
    const { data: sess } = await supabase
      .from("class_sessions")
      .select("class_id, starts_at")
      .in("class_id", published.map((c) => c.id))
      .eq("status", "scheduled")
      .gte("starts_at", nowISO)
      .order("starts_at", { ascending: true });
    for (const s of sess ?? []) if (!nextByClass.has(s.class_id)) nextByClass.set(s.class_id, s.starts_at);
  }

  // Your upcoming enrolled sessions.
  const { data: myEnr } = await supabase
    .from("class_enrollments")
    .select("id, session_id, class_id, status")
    .eq("user_id", user.id)
    .neq("status", "cancelled");
  const enr = myEnr ?? [];
  type Upcoming = { enrollmentId: string; status: string; classId: string; title: string; sportKey: string; startsAt: string };
  let upcoming: Upcoming[] = [];
  if (enr.length) {
    const sessIds = [...new Set(enr.map((e) => e.session_id))];
    const { data: sessRows } = await supabase
      .from("class_sessions")
      .select("id, class_id, starts_at, status")
      .in("id", sessIds)
      .eq("status", "scheduled")
      .gte("starts_at", nowISO);
    const sessMap = new Map((sessRows ?? []).map((s) => [s.id, s]));
    const classIds = [...new Set(enr.map((e) => e.class_id))];
    const { data: clsRows } = await supabase.from("classes").select("id, title, sport_key").in("id", classIds);
    const clsMap = new Map((clsRows ?? []).map((c) => [c.id, c]));
    upcoming = enr
      .map((e) => {
        const s = sessMap.get(e.session_id);
        const c = clsMap.get(e.class_id);
        if (!s || !c) return null;
        return { enrollmentId: e.id, status: e.status, classId: e.class_id, title: c.title, sportKey: c.sport_key, startsAt: s.starts_at };
      })
      .filter((x): x is Upcoming => x !== null)
      .sort((a, b) => a.startsAt.localeCompare(b.startsAt));
  }

  // Classes you host (any status).
  let hosting: Cls[] = [];
  if (provider) {
    const { data: mine } = await supabase
      .from("classes")
      .select("id, title, sport_key, summary, status, is_paid, price_cents, price_basis, recurrence, location_name")
      .eq("provider_id", user.id)
      .order("created_at", { ascending: false });
    hosting = (mine as Cls[] | null) ?? [];
  }

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-6 flex items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-flame-text">Discover — Classes &amp; Coaching</p>
        <h1 className="mt-1.5 font-display text-[40px] font-bold leading-none tracking-[-0.025em] text-ink">Classes &amp; Coaching</h1>
          <p className="mt-1 text-sm text-mute">Clinics, lessons, and coaching with verified Klimr professionals.</p>
          <Link href="/archive?tab=classes" className="mt-1.5 inline-block text-xs font-semibold text-brand-deep hover:underline">View past classes →</Link>
        </div>
        {provider ? (
          <Link
            href="/classes/new"
            className="press flex shrink-0 items-center gap-1.5 rounded-full bg-brand px-4 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep"
          >
            <Plus size={16} /> Create class
          </Link>
        ) : null}
      </div>

      {upcoming.length > 0 ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-mute">Your upcoming classes</h2>
          <div className="space-y-2.5">
            {upcoming.map((u) => {
              const m = sportMeta(u.sportKey);
              return (
                <Link key={u.enrollmentId} href={`/classes/${u.classId}`} className="lift flex items-center gap-3 rounded-2xl border border-rule bg-surface shadow-e1 p-4">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-lg" style={{ background: `color-mix(in oklab, var(--color-sport-${sportSlug(u.sportKey)}) 16%, transparent)` }}>{m.emoji}</span>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-bold text-ink">{u.title}</div>
                    <div className="text-xs text-mute">
                      <LocalTime iso={u.startsAt} />
                    </div>
                  </div>
                  <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${u.status === "waitlisted" ? "bg-rule/60 text-mute" : "bg-success/10 text-success"}`}>
                    {enrollmentLabel(u.status)}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {provider ? (
        <section className="mb-8">
          <h2 className="mb-3 text-sm font-semibold text-mute">Hosting</h2>
          {hosting.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-rule bg-surface p-6 text-center text-sm text-mute">
              You haven&rsquo;t created any classes yet.{" "}
              <Link href="/classes/new" className="font-semibold text-brand-deep hover:underline">
                Create your first
              </Link>
              .
            </div>
          ) : (
            <div className="grid gap-2.5 sm:grid-cols-2">
              {hosting.map((c) => (
                <ClassCard key={c.id} c={c} nextStart={nextByClass.get(c.id)} />
              ))}
            </div>
          )}
        </section>
      ) : null}

      <section>
        <h2 className="mb-3 text-sm font-semibold text-mute">{provider ? "All classes" : "Browse classes"}</h2>
        {published.length === 0 ? (
          <div className="rounded-2xl border border-rule bg-surface shadow-e1 p-10 text-center">
            <GraduationCap size={28} className="mx-auto text-faint" />
            <p className="mt-2 text-sm text-mute">No classes are published yet. Check back soon.</p>
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2">
            {published.map((c) => (
              <ClassCard key={c.id} c={c} nextStart={nextByClass.get(c.id)} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
