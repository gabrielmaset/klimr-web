import type { Metadata } from "next";
import Link from "next/link";
import { QueueHub } from "@/components/queue/queue-hub";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sportMeta } from "@/lib/sports";

export const metadata: Metadata = { title: "Live Queue \u00b7 Klimr" };

// The in-shell Live Queue home (left menu → here): join by code or start a
// standalone queue. The chromeless walk-up page at /q stays the QR / guest
// destination — same codes, same normalization, different frame.
// Standalone queues the person organizes are LISTED here — they aren't
// linked to any event, so this page is their only home; without this list a
// created queue was unreachable the moment you navigated away.
export default async function QueueHubPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  let mine: {
    id: string;
    title: string;
    sportKey: string;
    live: boolean;
    paused: boolean;
    courts: number;
    createdAt: string;
  }[] = [];

  if (user) {
    const admin = createAdminClient();
    const { data: sessions } = await admin
      .from("court_sessions")
      .select("id, title, sport_key, status, paused, created_at")
      .eq("organizer_id", user.id)
      .is("event_id", null)
      .is("tournament_id", null)
      .order("created_at", { ascending: false })
      .limit(12);
    const ids = (sessions ?? []).map((s) => s.id);
    const counts = new Map<string, number>();
    if (ids.length) {
      const { data: courts } = await admin.from("queue_courts").select("session_id").in("session_id", ids);
      for (const c of courts ?? []) counts.set(c.session_id, (counts.get(c.session_id) ?? 0) + 1);
    }
    mine = (sessions ?? []).map((s) => ({
      id: s.id,
      title: s.title,
      sportKey: s.sport_key,
      live: s.status === "live",
      paused: s.paused === true,
      courts: counts.get(s.id) ?? 0,
      createdAt: s.created_at,
    }));
  }

  return (
    <>
      {mine.length > 0 ? (
        <div className="mx-auto max-w-page px-5 pt-8 sm:pt-10">
          <p className="font-mono text-[11px] font-bold uppercase tracking-[0.16em] text-faint">Your live queues</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {mine.map((s) => {
              const meta = sportMeta(s.sportKey);
              return (
                <Link
                  key={s.id}
                  href={`/queue/${s.id}`}
                  className="press rounded-[14px] border border-rule bg-white p-4 transition-colors hover:border-brand"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="truncate text-[15px] font-bold text-ink">
                      {meta.emoji} {s.title}
                    </p>
                    {s.live && !s.paused ? (
                      <span className="inline-flex items-center gap-1.5 rounded-[7px] bg-[#F1F8E3] px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.12em] text-[#4D7C0F]">
                        <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[#4D7C0F]" /> LIVE
                      </span>
                    ) : (
                      <span className="rounded-[7px] bg-surface px-2 py-0.5 font-mono text-[9px] font-bold tracking-[0.12em] text-mute">
                        {s.paused ? "PAUSED" : "OFF"}
                      </span>
                    )}
                  </div>
                  <p className="mt-1.5 text-xs text-mute">
                    {meta.name} · {s.courts} {s.courts === 1 ? "court" : "courts"} · created{" "}
                    {new Date(s.createdAt).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                  </p>
                </Link>
              );
            })}
          </div>
        </div>
      ) : null}
      <QueueHub />
    </>
  );
}
