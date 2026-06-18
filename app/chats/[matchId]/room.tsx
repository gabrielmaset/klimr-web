"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronLeft, Lock, Send, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Avatar } from "@/components/avatar";
import { sportMeta } from "@/lib/sports";
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

type Participant = { id: string; name: string; hue: number; avatarUrl: string | null };
type Match = { id: string; sport_key: string; format: string; scheduled_at: string | null; location_text: string | null };
type Msg = { id: string; sender_id: string; text: string; created_at: string };

const QUICK_REPLIES = ["On my way 🏃", "Running 5 min late", "Switching courts", "See you there 👋"];

function whenLabel(iso: string | null) {
  if (!iso) return "Flexible time";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}
function msgTime(iso: string) {
  return new Date(iso).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export function ChatRoom({
  meId,
  match,
  participants,
  expiresAt,
}: {
  meId: string;
  match: Match;
  participants: Participant[];
  expiresAt: string | null;
}) {
  const [status, setStatus] = useState<"loading" | "ready" | "nokey" | "error">("loading");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);

  const [supabase] = useState(() => createClient());
  const convKeyRef = useRef<CryptoKey | null>(null);
  const convIdRef = useRef<string | null>(null);
  const identityRef = useRef<{ priv: CryptoKey; deviceId: string } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [now, setNow] = useState(0);

  const expired = !!expiresAt && now > 0 && now > new Date(expiresAt).getTime();
  const pById = new Map(participants.map((p) => [p.id, p]));

  const loadMessages = useCallback(async () => {
    const convId = convIdRef.current;
    const key = convKeyRef.current;
    if (!convId || !key) return;
    const { data } = await supabase
      .from("messages")
      .select("id, sender_id, ciphertext, iv, created_at")
      .eq("conversation_id", convId)
      .order("created_at", { ascending: false })
      .limit(100);
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
  }, [supabase]);

  // Setup: publish my key, resolve the conversation, obtain the conversation key,
  // distribute it to any participants who don't have it yet.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const identity = await getIdentity();
        identityRef.current = identity;
        await supabase.from("user_keys").upsert(
          { user_id: meId, device_id: identity.deviceId, public_key: identity.pubB64, updated_at: new Date().toISOString() },
          { onConflict: "user_id,device_id" },
        );

        // Resolve (or create) the conversation for this match.
        let convId: string | null = null;
        let isCreator = false;
        const { data: existing } = await supabase
          .from("conversations")
          .select("id")
          .eq("match_id", match.id)
          .maybeSingle();
        if (existing) {
          convId = existing.id;
        } else {
          const { data: created, error } = await supabase
            .from("conversations")
            .insert({ match_id: match.id, created_by: meId, expires_at: expiresAt })
            .select("id")
            .single();
          if (created) {
            convId = created.id;
            isCreator = true;
          } else if (error) {
            // Possible race — another participant created it first.
            const { data: again } = await supabase.from("conversations").select("id").eq("match_id", match.id).maybeSingle();
            convId = again?.id ?? null;
          }
        }
        if (!convId) throw new Error("no conversation");
        convIdRef.current = convId;

        // Mark this thread read (powers the Chats unread bubble). Best-effort.
        void supabase.from("conversation_reads").upsert(
          { user_id: meId, conversation_id: convId, last_read_at: new Date().toISOString() },
          { onConflict: "user_id,conversation_id" },
        );

        // Obtain the conversation key for THIS device.
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
          } else if (isCreator) {
            convKey = await generateConversationKey();
            await cacheConversationKey(convId, convKey);
          }
        }

        if (!convKey) {
          // A conversation exists but nobody has wrapped the key for me yet.
          if (!cancelled) setStatus("nokey");
          return;
        }
        convKeyRef.current = convKey;

        // Self-heal: wrap the key for every participant DEVICE (incl. my own other
        // devices, for resilience) that has registered a key but has no wrapped row.
        const ids = participants.map((p) => p.id);
        const [{ data: deviceKeys }, { data: keyRows }] = await Promise.all([
          supabase.from("user_keys").select("user_id, device_id, public_key").in("user_id", ids),
          supabase.from("conversation_keys").select("recipient_id, recipient_device").eq("conversation_id", convId),
        ]);
        const haveKey = new Set((keyRows ?? []).map((k) => `${k.recipient_id}|${k.recipient_device}`));
        for (const dk of deviceKeys ?? []) {
          if (haveKey.has(`${dk.user_id}|${dk.device_id}`)) continue;
          const { wrapped, iv } = await wrapKeyFor(dk.public_key, convKey, identity.priv);
          await supabase.from("conversation_keys").upsert(
            {
              conversation_id: convId,
              recipient_id: dk.user_id,
              recipient_device: dk.device_id,
              wrapped_key: wrapped,
              iv,
              wrapped_by: meId,
              wrapped_by_device: identity.deviceId,
            },
            { onConflict: "conversation_id,recipient_id,recipient_device" },
          );
        }

        if (!cancelled) setStatus("ready");
        await loadMessages();
      } catch {
        if (!cancelled) setStatus("error");
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [match.id, meId]);

  // Poll for new messages while the chat is open and usable.
  useEffect(() => {
    if (status !== "ready") return;
    const t = setInterval(() => {
      void loadMessages();
    }, 4000);
    return () => clearInterval(t);
  }, [status, loadMessages]);

  // If we're waiting on the key, keep checking — another device may wrap it for us.
  useEffect(() => {
    if (status !== "nokey") return;
    const t = setInterval(async () => {
      const id = identityRef.current;
      const convId = convIdRef.current;
      if (!id || !convId) return;
      const { data: myKey } = await supabase
        .from("conversation_keys")
        .select("wrapped_key, iv, wrapped_by, wrapped_by_device")
        .eq("conversation_id", convId)
        .eq("recipient_id", meId)
        .eq("recipient_device", id.deviceId)
        .maybeSingle();
      if (!myKey) return;
      const { data: wrapper } = await supabase
        .from("user_keys")
        .select("public_key")
        .eq("user_id", myKey.wrapped_by)
        .eq("device_id", myKey.wrapped_by_device)
        .maybeSingle();
      if (!wrapper) return;
      try {
        const convKey = await unwrapKey(myKey.wrapped_key, myKey.iv, wrapper.public_key, id.priv);
        convKeyRef.current = convKey;
        await cacheConversationKey(convId, convKey);
        setStatus("ready");
        await loadMessages();
      } catch {
        /* keep waiting */
      }
    }, 5000);
    return () => clearInterval(t);
  }, [status, supabase, meId, loadMessages]);

  // Keep the view pinned to the newest message.
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  // Tick a clock so expiry state stays current without reading time during render.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- set the clock once on mount
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 60_000);
    return () => clearInterval(t);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const body = text.trim();
      const key = convKeyRef.current;
      const convId = convIdRef.current;
      if (!body || !key || !convId || expired) return;
      setSending(true);
      try {
        const { ciphertext, iv } = await encryptMessage(key, body);
        await supabase.from("messages").insert({ conversation_id: convId, sender_id: meId, ciphertext, iv });
        setDraft("");
        await loadMessages();
      } finally {
        setSending(false);
      }
    },
    [supabase, meId, expired, loadMessages],
  );

  const meta = sportMeta(match.sport_key);
  const expiresInHrs = expiresAt && now > 0 ? Math.round((new Date(expiresAt).getTime() - now) / 3_600_000) : null;

  return (
    <div className="mx-auto flex h-dvh max-w-2xl flex-col px-0 sm:px-5">
      {/* header */}
      <div className="flex items-center gap-3 border-b border-rule bg-surface px-5 py-3 sm:rounded-b-2xl sm:border sm:border-t-0">
        <Link href="/chats" aria-label="Back to chats" className="press text-mute hover:text-ink">
          <ChevronLeft size={20} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-bold text-ink">
            {meta.emoji} {meta.name} · {match.format}
          </div>
          <div className="flex items-center gap-1.5 truncate text-xs text-faint">
            <Lock size={11} /> {participants.length} players · {whenLabel(match.scheduled_at)}
          </div>
        </div>
        {!expired && expiresInHrs !== null && expiresInHrs <= 24 ? (
          <span className="kicker rounded-full bg-tint-brand px-2 py-1 text-brand-deep">
            {expiresInHrs <= 0 ? "Expiring" : `Expires ${expiresInHrs}h`}
          </span>
        ) : null}
      </div>

      {/* messages */}
      <div ref={scrollRef} className="flex-1 space-y-2.5 overflow-y-auto px-5 py-4">
        {status === "loading" ? (
          <p className="py-10 text-center text-sm text-mute">Setting up secure chat…</p>
        ) : status === "error" ? (
          <p className="py-10 text-center text-sm text-mute">Couldn&apos;t open this chat. Please refresh.</p>
        ) : status === "nokey" ? (
          <div className="mx-auto mt-10 max-w-sm rounded-2xl border border-rule bg-surface p-5 text-center">
            <ShieldCheck className="mx-auto text-brand" size={22} />
            <p className="mt-2 text-sm font-semibold text-ink">Securing this chat</p>
            <p className="mt-1 text-xs text-mute">
              Another player in this match needs to open the chat once so your device can be given the encryption key. Try again shortly.
            </p>
          </div>
        ) : messages.length === 0 ? (
          <div className="mx-auto mt-10 max-w-sm text-center">
            <p className="text-sm font-semibold text-ink">This chat is end-to-end encrypted</p>
            <p className="mt-1 text-xs text-mute">Only the players in this match can read these messages. Say hi 👋</p>
          </div>
        ) : (
          messages.map((m, i) => {
            const mine = m.sender_id === meId;
            const p = pById.get(m.sender_id);
            const prev = messages[i - 1];
            const showWho = !mine && (!prev || prev.sender_id !== m.sender_id);
            return (
              <div key={m.id} className={mine ? "flex justify-end" : "flex items-end gap-2"}>
                {!mine ? (
                  <div className="w-7 shrink-0">
                    {showWho ? <Avatar url={p?.avatarUrl ?? null} hue={p?.hue ?? 200} name={p?.name ?? "Player"} size={28} /> : null}
                  </div>
                ) : null}
                <div className={mine ? "max-w-[78%]" : "max-w-[78%]"}>
                  {showWho ? <div className="mb-0.5 ml-1 text-xs font-semibold text-mute">{p?.name ?? "Player"}</div> : null}
                  <div
                    className="rounded-2xl px-3.5 py-2 text-[15px] leading-snug"
                    style={
                      mine
                        ? { background: "#ff4e1b", color: "#fff", borderBottomRightRadius: 6 }
                        : { background: "#f4f4f5", color: "#0a0a0b", borderBottomLeftRadius: 6 }
                    }
                  >
                    <span className="whitespace-pre-wrap">{m.text}</span>
                  </div>
                  <div className={`mt-0.5 text-[10px] text-faint ${mine ? "text-right" : "ml-1"}`}>{msgTime(m.created_at)}</div>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* composer */}
      {status === "ready" ? (
        expired ? (
          <div className="border-t border-rule bg-surface px-5 py-4 text-center text-sm text-mute sm:rounded-t-2xl sm:border">
            This chat has expired. Match chats close after you play.
          </div>
        ) : (
          <div className="border-t border-rule bg-surface px-5 py-3 sm:rounded-t-2xl sm:border">
            <div className="mb-2 flex gap-1.5 overflow-x-auto pb-1">
              {QUICK_REPLIES.map((q) => (
                <button
                  key={q}
                  type="button"
                  disabled={sending}
                  onClick={() => void send(q)}
                  className="press shrink-0 rounded-full border border-rule px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-[#f4f4f5] disabled:opacity-50"
                >
                  {q}
                </button>
              ))}
            </div>
            <div className="flex items-end gap-2">
              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void send(draft);
                  }
                }}
                rows={1}
                maxLength={2000}
                placeholder="Message"
                className="max-h-32 min-h-[2.5rem] flex-1 resize-none rounded-2xl border border-rule bg-bg px-4 py-2.5 text-[15px] text-ink outline-none focus:border-brand"
              />
              <button
                type="button"
                onClick={() => void send(draft)}
                disabled={sending || !draft.trim()}
                aria-label="Send"
                className="press grid h-10 w-10 shrink-0 place-items-center rounded-full bg-ink text-surface transition-colors hover:bg-ink-soft disabled:opacity-40"
              >
                <Send size={17} />
              </button>
            </div>
            <p className="mt-1.5 flex items-center gap-1 text-[10px] text-faint">
              <Lock size={9} /> End-to-end encrypted · only match players can read this
            </p>
          </div>
        )
      ) : null}
    </div>
  );
}
