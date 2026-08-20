"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Send, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { reportClientError } from "@/lib/client-diagnostics";
import { notifyDmMessage } from "@/app/messages/notify-actions";
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

type Msg = { id: string; sender_id: string; text: string; created_at: string };

/** Direct message thread — the same E2E mechanism as match & listing chats,
 *  text-only. Either participant can bootstrap the conversation key. */
export function DmRoom({ convId, meId, peer, backHref }: { convId: string; meId: string; peer: { id: string; name: string; hue: number }; backHref: string }) {
  const supabase = useMemo(() => createClient(), []);
  const [status, setStatus] = useState<"loading" | "ready" | "nokey" | "error">("loading");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const convKeyRef = useRef<CryptoKey | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

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

        const ids = [meId, peer.id];
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
          reportClientError({ message: "DM failed to open (secure setup error)", detail: `conv ${convId}`, userMessage: "Couldn\u2019t open this chat. Please refresh." });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [convId, meId]);

  useEffect(() => {
    if (status !== "ready") return;
    const channel = supabase
      .channel(`dm-room-${convId}`)
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
    const t = setInterval(() => void loadMessages(), 5000);
    return () => {
      clearInterval(t);
      void supabase.removeChannel(channel);
    };
  }, [status, supabase, convId, loadMessages]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages.length]);

  async function send() {
    const key = convKeyRef.current;
    const body = text.trim();
    if (!key || !body || busy) return;
    setBusy(true);
    try {
      const { ciphertext, iv } = await encryptMessage(key, body);
      const { error } = await supabase.from("messages").insert({ conversation_id: convId, sender_id: meId, ciphertext, iv });
      if (!error) {
        setText("");
        void notifyDmMessage({ convId });
        void supabase.from("conversation_reads").upsert(
          { user_id: meId, conversation_id: convId, last_read_at: new Date().toISOString() },
          { onConflict: "user_id,conversation_id" },
        );
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto flex h-[calc(100dvh-140px)] max-w-3xl flex-col px-5 py-6">
      <div className="flex items-center gap-3 border-b border-rule pb-3">
        <Link href={backHref} className="press text-mute hover:text-ink" aria-label="Back">
          <ArrowLeft size={17} />
        </Link>
        <span className="grid h-9 w-9 place-items-center rounded-full text-sm font-bold text-white" style={{ background: `oklch(0.62 0.14 ${peer.hue})` }}>
          {peer.name.slice(0, 1).toUpperCase()}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-bold text-ink">{peer.name}</p>
          <p className="flex items-center gap-1 text-[10.5px] text-faint">
            <ShieldCheck size={11} className="text-success" /> End-to-end encrypted — only you two can read this.
          </p>
        </div>
      </div>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto py-4">
        {status === "loading" ? <p className="text-center text-xs text-faint">Opening secure chat…</p> : null}
        {status === "nokey" ? <p className="text-center text-xs text-faint">Waiting for the other side to open the thread once so keys can be exchanged.</p> : null}
        {status === "error" ? <p className="text-center text-xs font-semibold text-danger">Couldn&rsquo;t open this chat — refresh to retry.</p> : null}
        <div className="grid gap-2">
          {messages.map((m) => (
            <div key={m.id} className={`max-w-[78%] rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed ${m.sender_id === meId ? "justify-self-end bg-ink text-surface" : "justify-self-start border border-rule bg-surface text-ink"}`}>
              {m.text}
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-end gap-2 border-t border-rule pt-3">
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
          placeholder={status === "ready" ? "Write a message…" : "Secure setup…"}
          disabled={status !== "ready"}
          className="max-h-32 min-h-[42px] flex-1 resize-y rounded-2xl border border-rule-2 bg-surface px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-brand disabled:opacity-60"
        />
        <button
          type="button"
          onClick={() => void send()}
          disabled={status !== "ready" || busy || !text.trim()}
          className="press grid h-[42px] w-[42px] place-items-center rounded-full text-white disabled:opacity-50"
          style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}
          aria-label="Send"
        >
          <Send size={16} />
        </button>
      </div>
    </div>
  );
}
