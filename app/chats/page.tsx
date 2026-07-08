import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Lock, MessageCircle, ChevronRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta, sportSlug } from "@/lib/sports";
import { SPORT_TONES } from "@/components/sport-chip";
import { PageHeader, StatusPill } from "@/components/page-header";
import { ChatsLiveRefresher } from "@/components/chats-live-refresher";

export const metadata: Metadata = { title: "Courtside" };
export const dynamic = "force-dynamic";

type MatchRow = { id: string; sport_key: string; format: string; scheduled_at: string | null; status: string };

const monoKicker = "font-mono text-[9.5px] font-bold uppercase tracking-[.18em]";

function whenLabel(iso: string | null) {
  if (!iso) return "Flexible time";
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function daysAgo(iso: string, nowMs: number) {
  return Math.max(1, Math.floor((nowMs - new Date(iso).getTime()) / 86400000));
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
  const liveConvIds: string[] = [];
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

    for (const c of convs ?? []) {
      if (!c.match_id) continue; // team conversations have no match
      expiryByMatch.set(c.match_id, c.expires_at);
      liveConvIds.push(c.id);
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

  matches.sort((a, b) => {
    const av = lastActivity.get(a.id) ?? a.scheduled_at ?? "";
    const bv = lastActivity.get(b.id) ?? b.scheduled_at ?? "";
    return bv.localeCompare(av);
  });

  // Server component renders once per request, so reading the clock here is stable.
  // eslint-disable-next-line react-hooks/purity
  const nowMs = Date.now();
  const isExpired = (id: string) => {
    const exp = expiryByMatch.get(id);
    return !!exp && nowMs > new Date(exp).getTime();
  };
  const active = matches.filter((m) => !isExpired(m.id));
  const expired = matches.filter((m) => isExpired(m.id));

  const Row = ({ m, dim }: { m: MatchRow; dim?: boolean }) => {
    const meta = sportMeta(m.sport_key);
    const tone = SPORT_TONES[sportSlug(m.sport_key)];
    const names = otherNames.get(m.id) ?? [];
    const others = names.length === 0 ? "Just you so far" : names.length <= 2 ? names.join(" & ") : `${names[0]}, ${names[1]} +${names.length - 2}`;
    const last = lastActivity.get(m.id);
    return (
      <Link key={m.id} href={`/chats/${m.id}`} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[#FBF8F1]">
        <span
          className={`grid h-[42px] w-[42px] shrink-0 place-items-center rounded-[13px] text-lg ${dim ? "opacity-55" : ""}`}
          style={{ background: tone?.bg ?? "var(--color-bg)", border: `1px solid ${tone?.bd ?? "var(--color-rule)"}` }}
        >
          {meta.emoji}
        </span>
        <span className={`min-w-0 flex-1 ${dim ? "opacity-55" : ""}`}>
          <span className="flex items-center gap-2">
            <span className="truncate text-sm font-bold text-ink">
              {meta.name} · {m.format === "doubles" ? "Doubles" : "Singles"}
            </span>
            {dim ? (
              <span className="rounded-full px-1.5 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[.14em] text-faint" style={{ background: "#F4EFE5", border: "1px solid var(--color-rule-2)" }}>
                Expired
              </span>
            ) : null}
          </span>
          <span className="block truncate text-xs text-mute">
            {others} · {whenLabel(m.scheduled_at)}
          </span>
          <span className="mt-0.5 block text-xs text-faint">
            {dim && last
              ? `Active ${daysAgo(last, nowMs)}d ago`
              : last
                ? "Active recently"
                : "No messages yet — start the chat"}
          </span>
        </span>
        <ChevronRight size={17} className="shrink-0" style={{ color: "#D8CFBE" }} />
      </Link>
    );
  };

  return (
    <div className="mx-auto max-w-[940px] px-5 pb-16 pt-[22px]">
      <ChatsLiveRefresher conversationIds={liveConvIds} userId={user.id} />
      <PageHeader
        kicker="Community — Chats"
        title="Courtside"
        sub={
          <span className="inline-flex items-center gap-1.5">
            <Lock size={13} /> One end-to-end encrypted chat per match.
          </span>
        }
        pill={
          matches.length ? (
            <StatusPill>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[.14em]">
                {active.length} active · {expired.length} expired
              </span>
            </StatusPill>
          ) : undefined
        }
      />

      {matches.length === 0 ? (
        <div className="mt-6 rounded-[18px] bg-bg px-6 py-8 text-center" style={{ border: "1px solid #EFE9DC" }}>
          <MessageCircle className="mx-auto text-faint" size={24} />
          <p className="mt-2 text-sm font-semibold text-ink">No match chats yet — join a match and a private chat opens for its players.</p>
          <Link href="/play" className="press mt-4 inline-flex h-[34px] items-center rounded-[10px] px-3.5 text-[13px] font-bold text-white shadow-flame" style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}>
            Find a match
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-6 overflow-hidden rounded-[20px] border border-rule bg-surface shadow-e1">
            {active.length ? (
              <>
                <p className={`${monoKicker} border-b border-rule-soft bg-bg px-4 py-2 text-faint`}>Active — {active.length}</p>
                <div className="divide-y divide-rule-soft">{active.map((m) => <Row key={m.id} m={m} />)}</div>
              </>
            ) : null}
            {expired.length ? (
              <>
                <p className={`${monoKicker} border-b border-t border-rule-soft bg-bg px-4 py-2 text-faint`}>Expired — {expired.length}</p>
                <div className="divide-y divide-rule-soft">{expired.map((m) => <Row key={m.id} m={m} dim />)}</div>
              </>
            ) : null}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-faint">
            Chats live with their match — they open when a match forms and wind down after it&rsquo;s played.
          </p>
        </>
      )}
    </div>
  );
}
