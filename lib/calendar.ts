import type { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";

type SB = Awaited<ReturnType<typeof createClient>>;

export type CalKind = "match" | "event" | "class" | "tournament";

export type CalEvent = {
  key: string;
  kind: CalKind;
  title: string;
  start: string; // ISO
  end: string | null; // ISO or null (falls back to a default block length)
  allDay: boolean;
  location: string | null;
  href: string;
  sport_key: string;
};

// How far back / ahead the calendar loads commitments so month navigation is
// populated without pulling the entire history.
const DAYS_BACK = 62;
const DAYS_AHEAD = 210;

/**
 * Every scheduled commitment for a user, in one list: matches they're in, events
 * they're going to, class sessions they're enrolled in, and tournaments they're
 * registered for. Used by the calendar page (and anywhere an aggregated schedule
 * is needed).
 */
export async function getCalendarEvents(supabase: SB, userId: string): Promise<CalEvent[]> {
  const now = Date.now();
  const from = new Date(now - DAYS_BACK * 86400000).toISOString();
  const to = new Date(now + DAYS_AHEAD * 86400000).toISOString();
  const out: CalEvent[] = [];

  // Matches the player organized or joined.
  const { data: parts } = await supabase.from("match_participants").select("match_id").eq("user_id", userId);
  const matchIds = [...new Set((parts ?? []).map((p) => p.match_id))];
  if (matchIds.length) {
    const { data: ms } = await supabase
      .from("matches")
      .select("id, sport_key, format, scheduled_at, location_text")
      .in("id", matchIds)
      .not("scheduled_at", "is", null)
      .gte("scheduled_at", from)
      .lte("scheduled_at", to)
      .order("scheduled_at");
    for (const m of ms ?? []) {
      if (!m.scheduled_at) continue;
      out.push({
        key: `m-${m.id}`,
        kind: "match",
        title: `${sportMeta(m.sport_key).name} · ${m.format === "doubles" ? "Doubles" : "Singles"}`,
        start: m.scheduled_at,
        end: null,
        allDay: false,
        location: m.location_text,
        href: `/play/${m.id}`,
        sport_key: m.sport_key,
      });
    }
  }

  // Events the player RSVP'd "going" to.
  {
    const { data: going } = await supabase.from("event_rsvps").select("event_id").eq("user_id", userId).eq("status", "going");
    const ids = [...new Set((going ?? []).map((r) => r.event_id))];
    if (ids.length) {
      const { data: evs } = await supabase
        .from("events")
        .select("id, title, sport_key, starts_at, ends_at, location_text")
        .in("id", ids)
        .neq("status", "cancelled")
        .gte("starts_at", from)
        .lte("starts_at", to)
        .order("starts_at");
      for (const e of evs ?? []) {
        out.push({
          key: `e-${e.id}`,
          kind: "event",
          title: e.title,
          start: e.starts_at,
          end: e.ends_at,
          allDay: false,
          location: e.location_text,
          href: `/events/${e.id}`,
          sport_key: e.sport_key,
        });
      }
    }
  }

  // Class sessions the player is enrolled in.
  {
    const { data: enr } = await supabase.from("class_enrollments").select("session_id").eq("user_id", userId).neq("status", "cancelled");
    const sessIds = [...new Set((enr ?? []).map((r) => r.session_id))];
    if (sessIds.length) {
      const { data: sess } = await supabase
        .from("class_sessions")
        .select("id, class_id, starts_at, ends_at, status")
        .in("id", sessIds)
        .neq("status", "cancelled")
        .gte("starts_at", from)
        .lte("starts_at", to)
        .order("starts_at");
      const classIds = [...new Set((sess ?? []).map((s) => s.class_id))];
      const { data: cls } = classIds.length
        ? await supabase.from("classes").select("id, title, sport_key").in("id", classIds)
        : { data: [] as { id: string; title: string; sport_key: string }[] };
      const clsById = new Map((cls ?? []).map((c) => [c.id, c]));
      for (const s of sess ?? []) {
        const c = clsById.get(s.class_id);
        out.push({
          key: `c-${s.id}`,
          kind: "class",
          title: c?.title ?? "Class",
          start: s.starts_at,
          end: s.ends_at,
          allDay: false,
          location: null,
          href: `/classes/${s.class_id}`,
          sport_key: c?.sport_key ?? "",
        });
      }
    }
  }

  // Tournaments the player is registered for (shown as all-day — they span days).
  {
    const { data: reg } = await supabase
      .from("tournament_registrations")
      .select("tournament_id, status")
      .eq("registrant_id", userId)
      .not("status", "in", "(withdrawn,declined)");
    const ids = [...new Set((reg ?? []).map((r) => r.tournament_id))];
    if (ids.length) {
      const { data: trs } = await supabase
        .from("tournaments")
        .select("id, code, title, sport_key, starts_at, location_name")
        .in("id", ids)
        .neq("status", "cancelled")
        .not("starts_at", "is", null)
        .gte("starts_at", from)
        .lte("starts_at", to)
        .order("starts_at");
      for (const t of trs ?? []) {
        if (!t.starts_at) continue;
        out.push({
          key: `t-${t.id}`,
          kind: "tournament",
          title: t.title,
          start: t.starts_at,
          end: null,
          allDay: true,
          location: t.location_name,
          href: `/e/${t.code}`,
          sport_key: t.sport_key,
        });
      }
    }
  }

  out.sort((a, b) => a.start.localeCompare(b.start));
  return out;
}
