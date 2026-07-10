"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Send, ShieldCheck, BadgeCheck, Tag, CalendarPlus, MapPin } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/client-diagnostics";
import { TRADE_TONE, FREE_TONE, PENDING_TONE } from "@/lib/marketplace";
import { makeOffer, respondOffer, withdrawOffer, proposeMeetup, respondMeetup } from "@/app/marketplace/offer-actions";
import { notifyThreadMessage } from "@/app/marketplace/chat-actions";
import {
  getIdentity,
  generateConversationKey,
  wrapKeyFor,
  unwrapKey,
  encryptMessage,
  decryptMessage,
  cacheConversationKey,
  getCachedConversationKey,
} from "@/lib/crypto/e2ee";

export type OfferRow = {
  id: string;
  buyer_id: string;
  actor_id: string;
  amount_cents: number | null;
  note: string | null;
  parent_offer_id: string | null;
  status: string;
  created_at: string;
  expires_at: string;
};
export type MeetupRow = {
  id: string;
  proposed_by: string;
  court_id: string | null;
  courtName?: string | null;
  place_text: string | null;
  starts_at: string;
  status: string;
  created_at: string;
};
type Msg = { id: string; sender_id: string; text: string; created_at: string };
type Item = { at: number } & ({ kind: "msg"; m: Msg } | { kind: "offer"; o: OfferRow } | { kind: "meetup"; u: MeetupRow });

const flame = "linear-gradient(140deg, #FF6A35, #E23E0D)";
const chipBtn =
  "press inline-flex h-8 items-center gap-1.5 rounded-full border border-rule-2 bg-surface px-3 text-xs font-semibold text-ink-soft transition-colors hover:text-ink disabled:opacity-50";

export function MarketplaceRoom(props: {
  convId: string;
  expiresAt: string | null;
  meId: string;
  buyerId: string;
  sellerId: string;
  other: { id: string; name: string; hue: number; verified: boolean };
  listing: { id: string; title: string; mode: "sale" | "trade" | "free"; status: string; priceText: string; priceCents: number | null; obo: boolean; cover: string | null };
  initialOffers: OfferRow[];
  initialMeetups: MeetupRow[];
  meetSpots: { id: string; name: string }[];
}) {
  const { convId, meId, buyerId, sellerId, other, listing, meetSpots } = props;
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<"loading" | "ready" | "nokey" | "error">("loading");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [offers, setOffers] = useState<OfferRow[]>(props.initialOffers);
  const [meetups, setMeetups] = useState<MeetupRow[]>(props.initialMeetups);
  const [text, setText] = useState("");
  const [actErr, setActErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [nowMs, setNowMs] = useState(0);

  const [offerOpen, setOfferOpen] = useState(false);
  const [counterOf, setCounterOf] = useState<OfferRow | null>(null);
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");

  const [meetOpen, setMeetOpen] = useState(false);
  const [spot, setSpot] = useState(meetSpots[0]?.id ?? "other");
  const [placeText, setPlaceText] = useState("");
  const [when, setWhen] = useState("");

  const convKeyRef = useRef<CryptoKey | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const iAmSeller = meId === sellerId;
  const expired = !!props.expiresAt && nowMs > 0 && nowMs > new Date(props.expiresAt).getTime();

  useEffect(() => {
    const raf = requestAnimationFrame(() => setNowMs(Date.now()));
    return () => cancelAnimationFrame(raf);
  }, []);

  const loadMessages = useCallback(async () => {
    const key = convKeyRef.current;
    if (!key) return;
    const { data } = await supabase
      .from("messages")
      .select("id, sender_id, ciphertext, iv, created_at")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: false })
      .limit(120);
    const rows = (data ?? []).slice().reverse();
    const out: Msg[] = [];
    for (const r of rows) {
      try {
        out.push({ id: r.id, sender_id: r.sender_id, text: await decryptMessage(key, r.ciphertext, r.iv), created_at: r.created_at });
      } catch {
        out.push({ id: r.id, sender_id: r.sender_id, text: "🔒 Unable to decrypt", created_at: r.created_at });
      }
    }
    setMessages(out);
  }, [supabase, convId]);

  const refreshStructured = useCallback(async () => {
    const [{ data: o }, { data: u }] = await Promise.all([
      supabase
        .from("listing_offers")
        .select("id, buyer_id, actor_id, amount_cents, note, parent_offer_id, status, created_at, expires_at")
        .eq("listing_id", listing.id)
        .eq("buyer_id", buyerId)
        .order("created_at", { ascending: true }),
      supabase
        .from("listing_meetups")
        .select("id, proposed_by, court_id, place_text, starts_at, status, created_at")
        .eq("listing_id", listing.id)
        .eq("buyer_id", buyerId)
        .order("created_at", { ascending: true }),
    ]);
    if (o) setOffers(o as OfferRow[]);
    if (u) setMeetups((cur) => (u as MeetupRow[]).map((m) => ({ ...m, courtName: cur.find((c) => c.id === m.id)?.courtName ?? meetSpots.find((s) => s.id === m.court_id)?.name ?? null })));
  }, [supabase, listing.id, buyerId, meetSpots]);

  // ── E2E setup (same mechanism as match chats; buyer bootstraps) ─────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const identity = await getIdentity();
        await supabase.from("user_keys").upsert(
          { user_id: meId, device_id: identity.deviceId, public_key: identity.pubB64, updated_at: new Date().toISOString() },
          { onConflict: "user_id,device_id" },
        );
        void supabase.from("conversation_reads").upsert(
          { user_id: meId, conversation_id: convId, last_read_at: new Date().toISOString() },
          { onConflict: "user_id,conversation_id" },
        );

        let convKey = await getCachedConversationKey(convId);
        if (!convKey) {
          const { data: myKey } = await supabase
            .from("conversation_keys")
            .select("wrapped_key, iv, wrapped_by, wrapped_by_device")
            .eq("conversation_id", convId)
            .eq("recipient_id", meId)
            .eq("recipient_device", identity.deviceId)
            .maybeSingle();
          if (myKey) {
            const { data: wrapper } = await supabase
              .from("user_keys")
              .select("public_key")
              .eq("user_id", myKey.wrapped_by)
              .eq("device_id", myKey.wrapped_by_device)
              .maybeSingle();
            if (wrapper) {
              convKey = await unwrapKey(myKey.wrapped_key, myKey.iv, wrapper.public_key, identity.priv);
              await cacheConversationKey(convId, convKey);
            }
          } else {
            const { count } = await supabase
              .from("conversation_keys")
              .select("recipient_id", { count: "exact", head: true })
              .eq("conversation_id", convId);
            if ((count ?? 0) === 0) {
              convKey = await generateConversationKey();
              await cacheConversationKey(convId, convKey);
            }
          }
        }
        if (!convKey) {
          if (!cancelled) setStatus("nokey");
          return;
        }
        convKeyRef.current = convKey;

        const ids = [buyerId, sellerId];
        const [{ data: deviceKeys }, { data: keyRows }] = await Promise.all([
          supabase.from("user_keys").select("user_id, device_id, public_key").in("user_id", ids),
          supabase.from("conversation_keys").select("recipient_id, recipient_device").eq("conversation_id", convId),
        ]);
        const have = new Set((keyRows ?? []).map((k) => `${k.recipient_id}|${k.recipient_device}`));
        for (const dk of deviceKeys ?? []) {
          if (have.has(`${dk.user_id}|${dk.device_id}`)) continue;
          const { wrapped, iv } = await wrapKeyFor(dk.public_key, convKey, identity.priv);
          await supabase.from("conversation_keys").upsert(
            { conversation_id: convId, recipient_id: dk.user_id, recipient_device: dk.device_id, wrapped_key: wrapped, iv, wrapped_by: meId, wrapped_by_device: identity.deviceId },
            { onConflict: "conversation_id,recipient_id,recipient_device" },
          );
        }

        if (!cancelled) setStatus("ready");
        await loadMessages();
      } catch {
        if (!cancelled) {
          setStatus("error");
          reportClientError({ message: "Listing chat failed to open (secure setup error)", detail: `conv ${convId}`, userMessage: "Couldn\u2019t open this chat. Please refresh." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId, meId]);

  // realtime + poll fallback (messages) and structured refresh
  useEffect(() => {
    if (status !== "ready") return;
    const channel = supabase
      .channel(`listing-room-${convId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "messages", filter: `conversation_id=eq.${convId}` }, async (payload) => {
        const r = payload.new as { id: string; sender_id: string; ciphertext: string; iv: string; created_at: string };
        const key = convKeyRef.current;
        if (!key) return;
        let t: string;
        try {
          t = await decryptMessage(key, r.ciphertext, r.iv);
        } catch {
          t = "🔒 Unable to decrypt";
        }
        setMessages((cur) => (cur.some((m) => m.id === r.id) ? cur : [...cur, { id: r.id, sender_id: r.sender_id, text: t, created_at: r.created_at }]));
      })
      .subscribe();
    const t = setInterval(() => {
      setNowMs(Date.now());
      void loadMessages();
      void refreshStructured();
    }, 4000);
    return () => {
      clearInterval(t);
      void supabase.removeChannel(channel);
    };
  }, [status, supabase, convId, loadMessages, refreshStructured]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length, offers.length, meetups.length, status]);

  const send = async (body?: string) => {
    const key = convKeyRef.current;
    const msg = (body ?? text).trim();
    if (!key || !msg || busy) return;
    setBusy(true);
    try {
      const { ciphertext, iv } = await encryptMessage(key, msg);
      const { data } = await supabase
        .from("messages")
        .insert({ conversation_id: convId, sender_id: meId, ciphertext, iv })
        .select("id, created_at")
        .single();
      if (data) {
        setMessages((cur) => (cur.some((m) => m.id === data.id) ? cur : [...cur, { id: data.id, sender_id: meId, text: msg, created_at: data.created_at }]));
        void notifyThreadMessage({ convId });
      }
      if (!body) setText("");
    } finally {
      setBusy(false);
    }
  };

  const runAction = async (fn: () => Promise<{ error?: string }>) => {
    if (busy) return;
    setBusy(true);
    setActErr(null);
    try {
      const r = await fn();
      if (r.error) setActErr(r.error);
      else {
        setOfferOpen(false);
        setCounterOf(null);
        setMeetOpen(false);
        setAmount("");
        setNote("");
        setPlaceText("");
        setWhen("");
        await refreshStructured();
      }
    } finally {
      setBusy(false);
    }
  };

  const timeline = useMemo<Item[]>(() => {
    const items: Item[] = [
      ...messages.map((m) => ({ kind: "msg" as const, m, at: new Date(m.created_at).getTime() })),
      ...offers.map((o) => ({ kind: "offer" as const, o, at: new Date(o.created_at).getTime() })),
      ...meetups.map((u) => ({ kind: "meetup" as const, u, at: new Date(u.created_at).getTime() })),
    ];
    return items.sort((a, b) => a.at - b.at);
  }, [messages, offers, meetups]);

  const counteredIds = useMemo(() => new Set(offers.map((o) => o.parent_offer_id).filter(Boolean) as string[]), [offers]);
  const hasOpenOffer = offers.some((o) => o.status === "open" && (nowMs === 0 || new Date(o.expires_at).getTime() > nowMs));
  const hasAccepted = offers.some((o) => o.status === "accepted");
  const listingOpen = ["active", "pending"].includes(listing.status);
  const canOffer = !iAmSeller && listing.mode === "sale" && listingOpen && !hasOpenOffer && !expired;
  const canMeet = !expired && (listing.mode !== "sale" ? listingOpen : hasAccepted || listing.status === "pending");
  const priceTone = listing.mode === "trade" ? TRADE_TONE.fg : listing.mode === "free" ? FREE_TONE.fg : "var(--color-ink)";
  const fmtWhen = (iso: string) =>
    new Date(iso).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="mx-auto w-full max-w-[880px] px-3 pt-2 sm:px-6 md:pt-3">
      <div className="flex h-[calc(100dvh-4rem-var(--bottom-nav-h))] min-h-[440px] flex-col overflow-hidden rounded-[20px] border border-rule bg-surface shadow-e1 md:h-[calc(100dvh-8.25rem)]">
        {/* header: back + listing card + counterpart */}
        <div className="flex items-center gap-3 border-b border-rule-soft bg-surface px-4 py-3">
          <Link href={`/marketplace/${listing.id}`} aria-label="Back to listing" className="press grid h-8 w-8 shrink-0 place-items-center rounded-full text-mute hover:text-ink">
            <ArrowLeft size={17} />
          </Link>
          <span className="h-10 w-[52px] shrink-0 overflow-hidden rounded-[9px] border border-rule-soft bg-bg">
            {listing.cover ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={listing.cover} alt="" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center text-base" aria-hidden><Tag size={15} className="text-faint" /></span>
            )}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-ink">{listing.title}</p>
            <p className="flex items-center gap-2 text-xs text-mute">
              <span className="font-mono font-bold" style={{ color: priceTone }}>{listing.priceText}</span>
              {listing.mode === "sale" && listing.obo ? <span className="font-mono text-[9px] font-bold text-faint">OBO</span> : null}
              <span className="truncate">· with {other.name}{other.verified ? " ✓" : ""}</span>
            </p>
          </div>
          {listing.status !== "active" ? (
            <span className="shrink-0 rounded-[6px] px-2 py-1 font-mono text-[8.5px] font-bold uppercase tracking-[.12em]" style={{ background: PENDING_TONE.bg, color: PENDING_TONE.fg, boxShadow: `inset 0 0 0 1px ${PENDING_TONE.bd}` }}>
              {listing.status}
            </span>
          ) : null}
        </div>
        <p className="flex items-center gap-1.5 border-b border-rule-soft bg-[#FDFBF7] px-4 py-1.5 text-[10.5px] text-faint">
          <ShieldCheck size={11} className="shrink-0 text-success" /> Meet at a court · inspect before paying · Klimr never processes payments.
        </p>

        {/* timeline */}
        <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto bg-bg px-4 py-4 sm:px-5">
          {status === "loading" ? <p className="pt-8 text-center text-xs font-semibold text-faint">Securing this chat…</p> : null}
          {status === "nokey" ? (
            <div className="mx-auto max-w-sm rounded-[16px] border border-rule bg-surface p-5 text-center shadow-e1">
              <ShieldCheck size={20} className="mx-auto text-brand" />
              <p className="mt-2 text-sm font-bold text-ink">Securing this chat</p>
              <p className="mt-1 text-xs leading-relaxed text-mute">The other player needs to open this thread once so your device can be handed the encryption key. Try again shortly.</p>
            </div>
          ) : null}
          {status === "error" ? <p className="pt-8 text-center text-xs font-semibold text-danger">Couldn&rsquo;t open this chat. Please refresh.</p> : null}
          {status === "ready" && timeline.length === 0 ? (
            <div className="pt-8 text-center">
              <p className="text-sm font-bold text-ink">This chat is end-to-end encrypted</p>
              <p className="mt-1 text-xs text-mute">Only you and {other.name} can read it. Say hi 👋{canOffer ? " — or open with an offer." : ""}</p>
            </div>
          ) : null}

          {timeline.map((it) => {
            if (it.kind === "msg") {
              const mine = it.m.sender_id === meId;
              return (
                <div key={`m-${it.m.id}`} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div
                    className="max-w-[78%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed"
                    style={mine ? { background: flame, color: "#fff", borderBottomRightRadius: 6 } : { background: "var(--color-surface)", color: "var(--color-ink)", border: "1px solid var(--color-rule-soft)", borderBottomLeftRadius: 6 }}
                  >
                    {it.m.text}
                  </div>
                </div>
              );
            }
            if (it.kind === "offer") {
              const o = it.o;
              const mine = o.actor_id === meId;
              const isExpiredOffer = o.status === "open" && nowMs > 0 && new Date(o.expires_at).getTime() < nowMs;
              const shown = isExpiredOffer ? "expired" : counteredIds.has(o.id) && o.status === "declined" ? "countered" : o.status;
              const stateTone =
                shown === "accepted" ? FREE_TONE : shown === "open" ? { fg: "var(--color-flame-text)", bg: "var(--color-tint-brand)", bd: "var(--color-tint-brand-bd)" } : PENDING_TONE;
              return (
                <div key={`o-${o.id}`} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                  <div className="w-[min(320px,86%)] rounded-[16px] border bg-surface p-3.5 shadow-e1" style={{ borderColor: shown === "open" ? "var(--color-tint-brand-bd)" : "var(--color-rule)" }}>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="font-mono text-[9px] font-bold uppercase tracking-[.14em] text-faint">{mine ? "Your offer" : `${other.name}'s offer`}</span>
                      <span className="rounded-[5px] px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[.1em]" style={{ background: stateTone.bg, color: stateTone.fg, boxShadow: `inset 0 0 0 1px ${stateTone.bd}` }}>{shown}</span>
                    </div>
                    <p className="mt-1 font-mono text-[22px] font-bold tabular text-ink">${Math.round((o.amount_cents ?? 0) / 100).toLocaleString("en-US")}</p>
                    {o.note ? <p className="mt-0.5 text-[12px] leading-relaxed text-mute">&ldquo;{o.note}&rdquo;</p> : null}
                    {shown === "open" ? (
                      <div className="mt-2.5 flex flex-wrap gap-1.5">
                        {mine ? (
                          <button type="button" disabled={busy} onClick={() => runAction(() => withdrawOffer({ offerId: o.id, convId }))} className={chipBtn}>Withdraw</button>
                        ) : (
                          <>
                            <button type="button" disabled={busy} onClick={() => runAction(() => respondOffer({ offerId: o.id, convId, decision: "accept" }))} className="press inline-flex h-8 items-center rounded-full px-3.5 text-xs font-bold text-white shadow-flame transition-[filter] hover:brightness-[1.06] disabled:opacity-50" style={{ background: flame }}>Accept</button>
                            <button type="button" disabled={busy} onClick={() => { setCounterOf(o); setOfferOpen(true); setAmount(""); setNote(""); }} className={chipBtn}>Counter</button>
                            <button type="button" disabled={busy} onClick={() => runAction(() => respondOffer({ offerId: o.id, convId, decision: "decline" }))} className={chipBtn}>Decline</button>
                          </>
                        )}
                      </div>
                    ) : null}
                  </div>
                </div>
              );
            }
            const u = it.u;
            const mine = u.proposed_by === meId;
            const uTone = u.status === "accepted" ? FREE_TONE : u.status === "proposed" ? { fg: "var(--color-flame-text)", bg: "var(--color-tint-brand)", bd: "var(--color-tint-brand-bd)" } : PENDING_TONE;
            return (
              <div key={`u-${u.id}`} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                <div className="w-[min(320px,86%)] rounded-[16px] border bg-surface p-3.5 shadow-e1" style={{ borderColor: u.status === "proposed" ? "var(--color-tint-brand-bd)" : "var(--color-rule)" }}>
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="font-mono text-[9px] font-bold uppercase tracking-[.14em] text-faint">Meetup {mine ? "you proposed" : `${other.name} proposed`}</span>
                    <span className="rounded-[5px] px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-[.1em]" style={{ background: uTone.bg, color: uTone.fg, boxShadow: `inset 0 0 0 1px ${uTone.bd}` }}>{u.status}</span>
                  </div>
                  <p className="mt-1.5 flex items-center gap-1.5 text-[13px] font-semibold text-ink"><MapPin size={13} className="shrink-0 text-mute" /> {u.courtName ?? u.place_text ?? "Public place"}</p>
                  <p className="mt-0.5 text-[12.5px] text-mute">{fmtWhen(u.starts_at)}</p>
                  <div className="mt-2.5 flex flex-wrap gap-1.5">
                    {u.status === "proposed" && !mine ? (
                      <>
                        <button type="button" disabled={busy} onClick={() => runAction(() => respondMeetup({ meetupId: u.id, convId, decision: "accept" }))} className="press inline-flex h-8 items-center rounded-full px-3.5 text-xs font-bold text-white shadow-flame transition-[filter] hover:brightness-[1.06] disabled:opacity-50" style={{ background: flame }}>Accept</button>
                        <button type="button" disabled={busy} onClick={() => runAction(() => respondMeetup({ meetupId: u.id, convId, decision: "decline" }))} className={chipBtn}>Decline</button>
                      </>
                    ) : null}
                    {u.status === "proposed" && mine ? (
                      <button type="button" disabled={busy} onClick={() => runAction(() => respondMeetup({ meetupId: u.id, convId, decision: "cancel" }))} className={chipBtn}>Cancel</button>
                    ) : null}
                    {u.status === "accepted" ? (
                      <a href={`/marketplace/messages/${convId}/ics?meetup=${u.id}`} className={`${chipBtn}`}>
                        <CalendarPlus size={13} /> Add to calendar
                      </a>
                    ) : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* composer */}
        {expired ? (
          <div className="border-t border-rule-soft bg-surface px-5 py-4 text-center text-sm text-mute">This thread has wound down — the listing closed a while back.</div>
        ) : status === "ready" ? (
          <div className="pb-safe border-t border-rule-soft bg-surface px-4 py-3 sm:px-5">
            {actErr ? <p className="mb-2 text-xs font-semibold text-danger">{actErr}</p> : null}

            {offerOpen ? (
              <div className="mb-2.5 flex flex-wrap items-center gap-2 rounded-[12px] border border-tint-brand-bd bg-tint-brand/60 p-2.5">
                <span className="font-mono text-[9px] font-bold uppercase tracking-[.14em] text-flame-text">{counterOf ? "Counter" : "Your offer"}</span>
                <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="$" aria-label="Offer amount" className="h-8 w-24 rounded-[9px] border border-rule-2 bg-surface px-2 font-mono text-[13px] font-bold text-ink outline-none" />
                <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={240} placeholder="Note (optional)" aria-label="Offer note" className="h-8 min-w-0 flex-1 rounded-[9px] border border-rule-2 bg-surface px-2 text-xs text-ink outline-none placeholder:text-faint" />
                <button type="button" disabled={busy} onClick={() => runAction(() => makeOffer({ listingId: listing.id, buyerId, convId, amount, note, parentOfferId: counterOf?.id ?? null }))} className="press h-8 rounded-full px-3.5 text-xs font-bold text-white shadow-flame disabled:opacity-50" style={{ background: flame }}>Send offer</button>
                <button type="button" onClick={() => { setOfferOpen(false); setCounterOf(null); }} className="press text-xs font-semibold text-mute hover:text-ink">Cancel</button>
              </div>
            ) : null}

            {meetOpen ? (
              <div className="mb-2.5 flex flex-wrap items-center gap-2 rounded-[12px] border border-tint-brand-bd bg-tint-brand/60 p-2.5">
                <span className="font-mono text-[9px] font-bold uppercase tracking-[.14em] text-flame-text">Meetup</span>
                <select value={spot} onChange={(e) => setSpot(e.target.value)} aria-label="Meet spot" className="h-8 rounded-[9px] border border-rule-2 bg-surface px-2 text-xs font-semibold text-ink outline-none">
                  {meetSpots.map((s) => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                  <option value="other">Other public place…</option>
                </select>
                {spot === "other" ? (
                  <input value={placeText} onChange={(e) => setPlaceText(e.target.value)} maxLength={120} placeholder="Where?" aria-label="Meet place" className="h-8 w-40 rounded-[9px] border border-rule-2 bg-surface px-2 text-xs text-ink outline-none placeholder:text-faint" />
                ) : null}
                <input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} aria-label="Meet time" className="h-8 rounded-[9px] border border-rule-2 bg-surface px-2 text-xs font-semibold text-ink outline-none" />
                <button type="button" disabled={busy} onClick={() => runAction(() => proposeMeetup({ listingId: listing.id, buyerId, convId, courtId: spot === "other" ? null : spot, placeText: spot === "other" ? placeText : null, startsAtIso: when ? new Date(when).toISOString() : "" }))} className="press h-8 rounded-full px-3.5 text-xs font-bold text-white shadow-flame disabled:opacity-50" style={{ background: flame }}>Propose</button>
                <button type="button" onClick={() => setMeetOpen(false)} className="press text-xs font-semibold text-mute hover:text-ink">Cancel</button>
              </div>
            ) : null}

            <div className="mb-2 flex flex-wrap gap-1.5">
              {canOffer && !offerOpen ? (
                <>
                  {(listing.priceCents ?? 0) >= 100 ? (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => runAction(() => makeOffer({ listingId: listing.id, buyerId, convId, amount: String((listing.priceCents ?? 0) / 100), note: "Buying at the asking price" }))}
                      className="press inline-flex h-8 items-center gap-1.5 rounded-full px-3.5 text-xs font-bold text-white shadow-flame transition-[filter] hover:brightness-[1.06] disabled:opacity-50"
                      style={{ background: flame }}
                    >
                      Buy at {listing.priceText}
                    </button>
                  ) : null}
                  <button type="button" onClick={() => { setOfferOpen(true); setCounterOf(null); }} className={chipBtn}><Tag size={13} /> Make an offer</button>
                </>
              ) : null}
              {canMeet && !meetOpen ? (
                <button type="button" onClick={() => setMeetOpen(true)} className={chipBtn}><CalendarPlus size={13} /> Propose meetup</button>
              ) : null}
              {listing.status === "sold" && !iAmSeller ? (
                <button type="button" disabled={busy} onClick={() => send("Got it \u2014 confirming the pickup went through. \u2705")} className={chipBtn}>Confirm received ✅</button>
              ) : null}
            </div>

            <div className="flex items-end gap-2">
              <textarea
                value={text}
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send();
                  }
                }}
                rows={1}
                placeholder={`Message ${other.name}…`}
                className="max-h-32 min-h-[40px] flex-1 resize-none rounded-[10px] border border-rule-2 bg-bg px-3 py-2.5 text-[13.5px] leading-relaxed text-ink outline-none placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/15"
              />
              <button
                type="button"
                aria-label="Send"
                disabled={busy || !text.trim()}
                onClick={() => void send()}
                className="press grid h-10 w-10 shrink-0 place-items-center rounded-full text-white shadow-flame transition-[filter] hover:brightness-[1.06] disabled:opacity-40"
                style={{ background: flame }}
              >
                <Send size={16} />
              </button>
            </div>
          </div>
        ) : null}
      </div>
      <span className="sr-only">{other.verified ? <BadgeCheck size={1} /> : null}</span>
    </div>
  );
}
