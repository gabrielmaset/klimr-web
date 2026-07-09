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

type MarketRowT = {
  convId: string;
  listingId: string;
  title: string;
  cover: string | null;
  mode: string;
  priceCents: number | null;
  listingStatus: string;
  role: "Selling" | "Buying";
  otherName: string;
  lastAt: string | null;
  expiresAt: string | null;
};

export default async function ChatsPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const sp = await searchParams;
  const tab = sp.tab === "marketplace" ? "marketplace" : "matches";
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

  // ── Marketplace threads (D3: organized separately from match chats) ──
  const market: MarketRowT[] = [];
  {
    const [{ data: asBuyer }, { data: myListings }] = await Promise.all([
      supabase.from("conversations").select("id, listing_id, created_by, expires_at").eq("created_by", user.id).not("listing_id", "is", null),
      supabase.from("marketplace_listings").select("id").eq("listed_by", user.id).eq("kind", "gear").neq("status", "removed"),
    ]);
    const myListingIds = (myListings ?? []).map((l) => l.id);
    const { data: asSeller } = myListingIds.length
      ? await supabase.from("conversations").select("id, listing_id, created_by, expires_at").in("listing_id", myListingIds)
      : { data: [] as { id: string; listing_id: string | null; created_by: string | null; expires_at: string | null }[] };

    const convs = [...(asBuyer ?? []), ...(asSeller ?? [])].filter(
      (c, i, arr) => c.listing_id && arr.findIndex((x) => x.id === c.id) === i,
    );
    if (convs.length) {
      const listingIds = [...new Set(convs.map((c) => c.listing_id as string))];
      const { data: ls } = await supabase
        .from("marketplace_listings")
        .select("id, title, photos, mode, price_cents, status, listed_by")
        .in("id", listingIds);
      const lById = new Map((ls ?? []).map((l) => [l.id, l]));
      const counterpartIds = [
        ...new Set(
          convs.map((c) => {
            const l = lById.get(c.listing_id as string);
            return c.created_by === user.id ? (l?.listed_by ?? "") : (c.created_by ?? "");
          }),
        ),
      ].filter(Boolean);
      const { data: profs } = counterpartIds.length
        ? await supabase.from("profiles").select("id, display_name").in("id", counterpartIds)
        : { data: [] as { id: string; display_name: string | null }[] };
      const nameOf = new Map((profs ?? []).map((pr) => [pr.id, pr.display_name || "Player"]));

      const mConvIds = convs.map((c) => c.id);
      liveConvIds.push(...mConvIds);
      const lastByConv = new Map<string, string>();
      const { data: mMsgs } = await supabase
        .from("messages")
        .select("conversation_id, created_at")
        .in("conversation_id", mConvIds)
        .order("created_at", { ascending: false });
      for (const m of mMsgs ?? []) if (!lastByConv.has(m.conversation_id)) lastByConv.set(m.conversation_id, m.created_at);

      for (const c of convs) {
        const l = lById.get(c.listing_id as string);
        if (!l || !l.listed_by) continue;
        const buying = c.created_by === user.id;
        market.push({
          convId: c.id,
          listingId: l.id,
          title: l.title,
          cover: l.photos?.[0] ? supabase.storage.from("listing-photos").getPublicUrl(l.photos[0]).data.publicUrl : null,
          mode: l.mode,
          priceCents: l.price_cents,
          listingStatus: l.status,
          role: buying ? "Buying" : "Selling",
          otherName: nameOf.get(buying ? l.listed_by : (c.created_by ?? "")) ?? "Player",
          lastAt: lastByConv.get(c.id) ?? null,
          expiresAt: c.expires_at,
        });
      }
      market.sort((a, b) => (b.lastAt ?? "").localeCompare(a.lastAt ?? ""));
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
  const marketActive = market.filter((m) => !m.expiresAt || nowMs <= new Date(m.expiresAt).getTime());
  const marketExpired = market.filter((m) => !!m.expiresAt && nowMs > new Date(m.expiresAt).getTime());

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
            <Lock size={13} />
            {tab === "marketplace" ? "One end-to-end encrypted thread per listing, per buyer." : "One end-to-end encrypted chat per match."}
          </span>
        }
        pill={
          (tab === "marketplace" ? market.length : matches.length) ? (
            <StatusPill>
              <span className="font-mono text-[10px] font-bold uppercase tracking-[.14em]">
                {tab === "marketplace" ? `${marketActive.length} live · ${marketExpired.length} wound down` : `${active.length} active · ${expired.length} expired`}
              </span>
            </StatusPill>
          ) : undefined
        }
      />

      <div className="mt-5 flex gap-1.5">
        <Link
          href="/chats"
          className={`press inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors ${tab === "matches" ? "border-tint-brand-bd bg-tint-brand text-flame-text" : "border-rule bg-surface text-mute hover:text-ink"}`}
        >
          Matches <span className="font-mono text-[10px] font-bold">{matches.length}</span>
        </Link>
        <Link
          href="/chats?tab=marketplace"
          className={`press inline-flex h-8 items-center gap-1.5 rounded-full border px-3.5 text-xs font-semibold transition-colors ${tab === "marketplace" ? "border-tint-brand-bd bg-tint-brand text-flame-text" : "border-rule bg-surface text-mute hover:text-ink"}`}
        >
          Marketplace <span className="font-mono text-[10px] font-bold">{market.length}</span>
        </Link>
      </div>

      {tab === "marketplace" ? (
        market.length === 0 ? (
          <div className="mt-6 rounded-[18px] bg-bg px-6 py-8 text-center" style={{ border: "1px solid #EFE9DC" }}>
            <MessageCircle className="mx-auto text-faint" size={24} />
            <p className="mt-2 text-sm font-semibold text-ink">No gear chats yet — message a seller from any Second Serve listing.</p>
            <Link href="/marketplace" className="press mt-4 inline-flex h-[34px] items-center rounded-[10px] px-3.5 text-[13px] font-bold text-white shadow-flame" style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}>
              Browse gear
            </Link>
          </div>
        ) : (
          <>
            <div className="mt-6 overflow-hidden rounded-[20px] border border-rule bg-surface shadow-e1">
              {marketActive.length ? (
                <>
                  <p className={`${monoKicker} border-b border-rule-soft bg-bg px-4 py-2 text-faint`}>Live — {marketActive.length}</p>
                  <div className="divide-y divide-rule-soft">{marketActive.map((m) => <MarketRow key={m.convId} m={m} nowMs={nowMs} />)}</div>
                </>
              ) : null}
              {marketExpired.length ? (
                <>
                  <p className={`${monoKicker} border-b border-t border-rule-soft bg-bg px-4 py-2 text-faint`}>Wound down — {marketExpired.length}</p>
                  <div className="divide-y divide-rule-soft">{marketExpired.map((m) => <MarketRow key={m.convId} m={m} nowMs={nowMs} dim />)}</div>
                </>
              ) : null}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-faint">
              Gear threads stay open while the listing is live, and for 30 days after it closes.
            </p>
          </>
        )
      ) : matches.length === 0 ? (
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

function MarketRow({ m, nowMs, dim }: { m: MarketRowT; nowMs: number; dim?: boolean }) {
  const priceTone = m.mode === "trade" ? "#B45309" : m.mode === "free" ? "#217A34" : "var(--color-ink)";
  const price = m.mode === "trade" ? "TRADE" : m.mode === "free" ? "FREE" : m.priceCents != null ? `$${Math.round(m.priceCents / 100).toLocaleString("en-US")}` : "$—";
  return (
    <Link
      href={`/marketplace/messages/${m.convId}`}
      className={`flex items-center gap-3 px-4 py-3 transition-colors hover:bg-[#FBF8F1] ${dim ? "opacity-60" : ""}`}
    >
      <span className="h-10 w-[52px] shrink-0 overflow-hidden rounded-[9px] border border-rule-soft bg-bg">
        {m.cover ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={m.cover} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="grid h-full w-full place-items-center text-sm" aria-hidden>🎒</span>
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-bold text-ink">{m.title}</span>
          <span className={`shrink-0 rounded-full px-2 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[.12em] ${m.role === "Selling" ? "bg-tint-brand text-flame-text" : "bg-bg text-faint"}`} style={{ boxShadow: m.role === "Selling" ? "inset 0 0 0 1px var(--color-tint-brand-bd)" : "inset 0 0 0 1px #E4DCCB" }}>
            {m.role}
          </span>
          {m.listingStatus !== "active" ? (
            <span className="shrink-0 rounded-[5px] bg-[#F4EFE5] px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[.1em] text-[#8A8069]">{m.listingStatus}</span>
          ) : null}
        </span>
        <span className="mt-0.5 flex items-center gap-2 text-xs text-mute">
          <span className="font-mono font-bold" style={{ color: priceTone }}>{price}</span>
          <span className="truncate">· {m.otherName}</span>
          <span className="truncate text-faint">
            {m.lastAt ? `· Active ${Math.max(0, Math.floor((nowMs - new Date(m.lastAt).getTime()) / 86400000))}d ago` : "· No messages yet"}
          </span>
        </span>
      </span>
      <ChevronRight size={17} className="shrink-0" style={{ color: "#D8CFBE" }} />
    </Link>
  );
}
