"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Monitor, Minus, Plus } from "lucide-react";

// Codes are 6 chars; a COURT code is the same 6 plus the court number
// ("3ZGARK2" = code 3ZGARK, court 2) — as printed beside each court in
// Organizer tools and typed into the Courtside iPad. Accept both here.
function cleanCode(v: string): string {
  return v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 7);
}
function splitCode(v: string): { code: string; court: number | null } {
  if (v.length === 7) {
    const n = Number(v[6]);
    if (n >= 1 && n <= 9) return { code: v.slice(0, 6), court: n };
  }
  return { code: v.slice(0, 6), court: null };
}

export function QLanding() {
  const router = useRouter();
  const [code, setCode] = useState("");
  const [showCourt, setShowCourt] = useState(false);
  const [csCode, setCsCode] = useState("");
  const [court, setCourt] = useState(1);

  const joinReady = code.length >= 6;
  const cs = splitCode(csCode);
  const csReady = csCode.length >= 6;

  const join = () => {
    if (joinReady) router.push(`/q/${splitCode(code).code}`);
  };
  const openDisplay = () => {
    if (csReady) router.push(`/q/${cs.code}/${cs.court ?? court}`);
  };

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center bg-[radial-gradient(120%_90%_at_50%_-10%,#fff3ee,#fafafa_60%)] px-5 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 text-center">
          <span className="font-display text-3xl tracking-tight text-ink">
            Klimr<span className="text-brand">.</span>
          </span>
        </div>

        {/* Walk-up join — the main action */}
        <div className="rounded-3xl border border-rule bg-surface p-6 shadow-[0_18px_50px_-30px_rgba(10,10,11,0.4)]">
          <p className="kicker text-brand-deep">Live queue</p>
          <h1 className="mt-1 font-display text-2xl text-ink">Join the line</h1>
          <p className="mt-1.5 text-sm leading-relaxed text-mute">Enter the code shown at the court or on the organizer&rsquo;s screen.</p>

          <input
            value={code}
            onChange={(e) => setCode(cleanCode(e.target.value))}
            onKeyDown={(e) => {
              if (e.key === "Enter") join();
            }}
            inputMode="text"
            autoCapitalize="characters"
            autoComplete="off"
            spellCheck={false}
            placeholder="ABC123"
            aria-label="Queue or court code"
            className="mt-4 w-full rounded-[10px] border-2 border-rule-2 bg-white py-4 text-center font-mono text-3xl font-bold uppercase tracking-[0.35em] text-ink outline-none transition-colors placeholder:tracking-[0.35em] placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/15"
          />

          <button
            type="button"
            onClick={join}
            disabled={!joinReady}
            className="press mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand py-3.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-40"
          >
            Join the queue <ArrowRight size={16} />
          </button>
        </div>

        {/* Standalone: no event needed — just meet and play */}
        <div className="mt-4 flex items-center justify-between gap-3 rounded-3xl border border-rule bg-surface p-4 shadow-e1/60">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-ink">Meeting up to play?</p>
            <p className="text-xs text-mute">Start your own live queue &mdash; pick the sport, name your court, share the code.</p>
          </div>
          <Link href="/queue/new" className="press shrink-0 rounded-full border border-ink px-4 py-2 text-xs font-bold text-ink transition-colors hover:bg-ink hover:text-white">
            Create
          </Link>
        </div>

        {/* Courtside — discreet */}
        <div className="mt-5 text-center">
          {!showCourt ? (
            <button
              type="button"
              onClick={() => {
                setShowCourt(true);
                setCsCode(code);
              }}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-faint transition-colors hover:text-mute"
            >
              <Monitor size={13} /> Running a courtside display?
            </button>
          ) : (
            <div className="rounded-3xl border border-rule bg-surface shadow-e1/80 p-5 text-left">
              <p className="flex items-center gap-1.5 text-sm font-semibold text-ink">
                <Monitor size={15} /> Courtside display
              </p>
              <p className="mt-1 text-xs text-mute">Same session code, plus the court number. Best on a tablet at the net.</p>

              <div className="mt-3 flex items-end gap-3">
                <div className="flex-1">
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-faint">Code</label>
                  <input
                    value={csCode}
                    onChange={(e) => setCsCode(cleanCode(e.target.value))}
                    autoCapitalize="characters"
                    autoComplete="off"
                    spellCheck={false}
                    placeholder="ABC123"
                    aria-label="Courtside code"
                    className="w-full rounded-[10px] border border-rule-2 bg-white py-2.5 text-center font-mono text-lg font-bold uppercase tracking-[0.2em] text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-faint">Court</label>
                  {cs.court ? (
                    <div className="grid h-11 min-w-11 place-items-center rounded-xl border border-rule bg-bg px-3 font-mono text-lg font-bold text-ink" title="Court number from the code">{cs.court}</div>
                  ) : (
                  <div className="flex items-center gap-1 rounded-xl border border-rule bg-white p-1">
                    <button type="button" onClick={() => setCourt((c) => Math.max(1, c - 1))} aria-label="Fewer" className="press grid h-9 w-9 place-items-center rounded-lg text-mute hover:bg-bg">
                      <Minus size={15} />
                    </button>
                    <span className="w-6 text-center font-mono text-lg font-bold text-ink">{court}</span>
                    <button type="button" onClick={() => setCourt((c) => Math.min(20, c + 1))} aria-label="More" className="press grid h-9 w-9 place-items-center rounded-lg text-mute hover:bg-bg">
                      <Plus size={15} />
                    </button>
                  </div>
                  )}
                </div>
              </div>

              <button
                type="button"
                onClick={openDisplay}
                disabled={!csReady}
                className="press mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full border border-ink bg-ink py-3 text-sm font-semibold text-white transition-colors hover:bg-ink-soft disabled:opacity-40"
              >
                Open display <ArrowRight size={15} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
