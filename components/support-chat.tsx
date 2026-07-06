"use client";

import { useEffect, useRef, useState } from "react";
import { Sparkles, X, Send, LifeBuoy, CheckCircle2 } from "lucide-react";

// Floating "Ask Klimr" assistant: a launcher pinned to the corner that opens a
// chat panel. One conversation per page visit, persisted server-side so admins
// can review transcripts and escalations keep their context.

type Msg = { id: number; role: "user" | "assistant"; content: string };

const SUGGESTIONS = [
  "Why are my ranking points still pending?",
  "How do I pay my tournament entry fee?",
  "I can't join a live queue",
  "How do I become a coach on Klimr?",
];

export function SupportChat({
  startOpen = false,
  open: controlledOpen,
  onOpenChange,
}: {
  startOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
}) {
  const [internalOpen, setInternalOpen] = useState(startOpen);
  const open = controlledOpen ?? internalOpen;
  const setOpen = (v: boolean) => {
    onOpenChange?.(v);
    if (controlledOpen === undefined) setInternalOpen(v);
  };
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [escalated, setEscalated] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const conversationRef = useRef<string | null>(null);
  const nextId = useRef(1);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Keep the newest message in view.
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    setError(null);
    setInput("");
    setMessages((m) => [...m, { id: nextId.current++, role: "user", content: trimmed }]);
    setBusy(true);
    try {
      const res = await fetch("/api/support-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversationRef.current, message: trimmed }),
      });
      const data = (await res.json()) as { conversationId?: string; reply?: string; escalated?: boolean; error?: string };
      if (!res.ok || !data.reply) {
        setError(data.error ?? "Something went wrong — try again.");
        return;
      }
      conversationRef.current = data.conversationId ?? conversationRef.current;
      if (data.escalated) setEscalated(true);
      setMessages((m) => [...m, { id: nextId.current++, role: "assistant", content: data.reply! }]);
    } catch {
      setError("Couldn't reach the assistant — check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      {/* Launcher — sits above the mobile bottom nav, corner on desktop */}
      {!open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="press fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-4 z-40 inline-flex items-center gap-2 rounded-full bg-ink px-4 py-3 text-sm font-bold text-white shadow-xl shadow-black/20 transition-transform hover:scale-[1.03] md:bottom-6 md:right-6"
          aria-label="Ask the Klimr Assistant"
        >
          <Sparkles size={16} className="text-pop" /> Ask Klimr
        </button>
      ) : null}

      {/* Panel */}
      {open ? (
        <div
          className="fixed bottom-[calc(5.75rem+env(safe-area-inset-bottom))] right-4 z-50 flex w-[min(400px,calc(100vw-2rem))] flex-col overflow-hidden rounded-3xl border border-rule bg-bg shadow-2xl shadow-black/25 md:bottom-6 md:right-6"
          style={{ height: "min(600px, calc(100dvh - 8rem))" }}
          role="dialog"
          aria-label="Klimr Assistant"
        >
          {/* header */}
          <div className="relative shrink-0 overflow-hidden bg-ink px-4 py-3.5 text-white">
            <div
              className="pointer-events-none absolute -right-10 -top-14 h-36 w-36 rounded-full opacity-30 blur-2xl"
              style={{ background: "radial-gradient(circle, #f97316, transparent 70%)" }}
            />
            <div className="relative flex items-center gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white/10">
                <Sparkles size={17} className="text-pop" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-extrabold leading-tight">Klimr Assistant</p>
                <p className="text-[11px] text-white/65">Instant answers · hands off to our team when needed</p>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="press grid h-8 w-8 place-items-center rounded-full text-white/70 hover:bg-white/10 hover:text-white">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* messages */}
          <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto bg-surface/60 px-4 py-4">
            <div className="flex items-start gap-2">
              <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-tint-brand text-brand-deep"><LifeBuoy size={12} /></span>
              <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-rule bg-bg px-3.5 py-2.5 text-sm leading-relaxed text-ink">
                Hi! I&rsquo;m the Klimr Assistant. Ask me anything about the app — accounts, rankings, tournaments, queues — and if I can&rsquo;t fix it, I&rsquo;ll flag our team for you.
              </div>
            </div>

            {messages.map((m) =>
              m.role === "user" ? (
                <div key={m.id} className="flex justify-end">
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tr-md bg-ink px-3.5 py-2.5 text-sm leading-relaxed text-white">{m.content}</div>
                </div>
              ) : (
                <div key={m.id} className="flex items-start gap-2">
                  <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-tint-brand text-brand-deep"><LifeBuoy size={12} /></span>
                  <div className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-tl-md border border-rule bg-bg px-3.5 py-2.5 text-sm leading-relaxed text-ink">{m.content}</div>
                </div>
              ),
            )}

            {busy ? (
              <div className="flex items-start gap-2">
                <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-tint-brand text-brand-deep"><LifeBuoy size={12} /></span>
                <div className="rounded-2xl rounded-tl-md border border-rule bg-bg px-4 py-3">
                  <span className="flex gap-1">
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-faint [animation-delay:-0.3s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-faint [animation-delay:-0.15s]" />
                    <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-faint" />
                  </span>
                </div>
              </div>
            ) : null}

            {escalated ? (
              <p className="flex items-center justify-center gap-1.5 pt-1 text-center text-[11px] font-semibold text-success">
                <CheckCircle2 size={12} /> Ticket filed — our team will follow up by email
              </p>
            ) : null}

            {error ? <p className="text-center text-xs font-medium text-brand-deep">{error}</p> : null}

            {messages.length === 0 && !busy ? (
              <div className="flex flex-wrap gap-1.5 pt-1">
                {SUGGESTIONS.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} className="press rounded-full border border-rule bg-bg px-3 py-1.5 text-xs font-semibold text-mute hover:border-ink/30 hover:text-ink">
                    {s}
                  </button>
                ))}
              </div>
            ) : null}
          </div>

          {/* composer */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send(input);
            }}
            className="shrink-0 border-t border-rule bg-bg p-3"
          >
            <div className="flex items-center gap-2">
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                maxLength={2000}
                placeholder="Ask about anything in Klimr…"
                className="h-11 min-w-0 flex-1 rounded-xl border border-rule bg-surface px-3.5 text-sm text-ink outline-none placeholder:text-faint focus:border-ink/40"
              />
              <button
                type="submit"
                disabled={busy || !input.trim()}
                aria-label="Send"
                className="press grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand text-white transition-opacity disabled:opacity-40"
              >
                <Send size={17} />
              </button>
            </div>
            <p className="mt-2 text-center text-[10px] text-faint">AI answers can make mistakes — anything it can&rsquo;t solve goes to our team.</p>
          </form>
        </div>
      ) : null}
    </>
  );
}
