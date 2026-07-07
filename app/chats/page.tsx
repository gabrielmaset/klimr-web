import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock, MessageCircle, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta, sportSlug } from "@/lib/sports";

export const metadata: Metadata = { title: "Chats" };

type MatchRow = { id: string; sport_key: string; format: string; scheduled_at: string | null; status: string };

function whenLabel(iso: string | null) {
  if (!iso) return "Flexible time";
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function activityLabel(iso: string) {
  const sec = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (sec < 60) return "just now";
  if (sec < 3600) return `${Math.floor(sec / 60)}m ago`;
  if (sec < 86400) return `${Math.floor(sec / 3600)}h ago`;
  return `${Math.floor(sec / 86400)}d ago`;
}

export default async function ChatsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/chats");

  const { data: myParts } = await supabase.from("match_participants").select("match_id").eq("user_id", user.id);
  const matchIds = [...new Set((myParts ?? []).map((m) => m.match_id))];

  let matches: MatchRow[] = [];
  const otherNames = new Map<string, string[]>();
  const lastActivity = new Map<string, string>();
  const expiryByMatch = new Map<string, string | null>();

  if (matchIds.length) {
    const [{ data: ms }, { data: parts }, { data: convs }] = await Promise.all([
      supabase.from("matches").select("id, sport_key, format, scheduled_at, status").in("id", matchIds),
      supabase.from("match_participants").select("match_id, user_id").in("match_id", matchIds),
      supabase.from("conversations").select("id, match_id, expires_at").in("match_id", matchIds),
    ]);
    matches = (ms as MatchRow[] | null) ?? [];

    // resolve names for everyone except me
    const everyone = [...new Set((parts ?? []).map((p) => p.user_id))].filter((id) => id !== user.id);
    const nameById = new Map<string, string>();
    if (everyone.length) {
      const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", everyone);
      for (const p of profs ?? []) nameById.set(p.id, p.display_name || "Player");
    }
    for (const p of parts ?? []) {
      if (p.user_id === user.id) continue;
      const arr = otherNames.get(p.match_id) ?? [];
      arr.push(nameById.get(p.user_id) ?? "Player");
      otherNames.set(p.match_id, arr);
    }

    const convByMatch = new Map<string, { id: string; expires_at: string | null }>();
    for (const c of convs ?? []) {
      if (!c.match_id) continue; // team conversations have no match
      convByMatch.set(c.match_id, { id: c.id, expires_at: c.expires_at });
      expiryByMatch.set(c.match_id, c.expires_at);
    }
    const convIds = (convs ?? []).map((c) => c.id);
    if (convIds.length) {
      const { data: msgs } = await supabase
        .from("messages")
        .select("conversation_id, created_at")
        .in("conversation_id", convIds)
        .order("created_at", { ascending: false });
      const convToMatch = new Map((convs ?? []).map((c) => [c.id, c.match_id]));
      for (const m of msgs ?? []) {
        const mid = convToMatch.get(m.conversation_id);
        if (mid && !lastActivity.has(mid)) lastActivity.set(mid, m.created_at);
      }
    }
  }

  // Sort: most recent activity first, then upcoming matches.
  matches.sort((a, b) => {
    const av = lastActivity.get(a.id) ?? a.scheduled_at ?? "";
    const bv = lastActivity.get(b.id) ?? b.scheduled_at ?? "";
    return bv.localeCompare(av);
  });

  // Server component renders once per request, so reading the clock here is stable.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-2">
        <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Chats</h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-mute">
          <Lock size={13} /> One end-to-end encrypted chat per match.
        </p>
      </div>

      {matches.length === 0 ? (
        <div className="mt-6 rounded-2xl border border-rule bg-surface p-10 text-center">
          <MessageCircle className="mx-auto text-faint" size={26} />
          <p className="mt-2 text-sm font-semibold text-ink">No match chats yet</p>
          <p className="mt-1 text-sm text-mute">Join or create a match and a private chat opens for the players.</p>
          <Link href="/play" className="press mt-4 inline-block rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface hover:bg-ink-soft">
            Find a match
          </Link>
        </div>
      ) : (
        <div className="mt-5 space-y-2.5">
          {matches.map((m) => {
            const meta = sportMeta(m.sport_key);
            const names = otherNames.get(m.id) ?? [];
            const others = names.length === 0 ? "Just you so far" : names.length <= 2 ? names.join(" & ") : `${names[0]}, ${names[1]} +${names.length - 2}`;
            const last = lastActivity.get(m.id);
            const exp = expiryByMatch.get(m.id);
            const expired = !!exp && nowMs > new Date(exp).getTime();
            return (
              <Link
                key={m.id}
                href={`/chats/${m.id}`}
                className="lift flex items-center gap-3 rounded-2xl border border-rule bg-surface p-4"
              >
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full text-lg" style={{ background: `color-mix(in oklab, var(--color-sport-${sportSlug(m.sport_key)}) 16%, transparent)` }}>
                  {meta.emoji}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className="truncate text-sm font-bold text-ink">{others}</span>
                    {expired ? <span className="kicker text-faint">Expired</span> : null}
                  </span>
                  <span className="block truncate text-xs text-mute">
                    {meta.name} · {m.format} · {whenLabel(m.scheduled_at)}
                  </span>
                  <span className="mt-0.5 block text-xs text-faint">{last ? `Active ${activityLabel(last)}` : "No messages yet — start the chat"}</span>
                </span>
                <ChevronRight size={18} className="shrink-0 text-faint" />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
