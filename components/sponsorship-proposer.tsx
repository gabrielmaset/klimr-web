"use client";

import { useState, useTransition } from "react";
import { CalendarDays, Flag, Loader2, Search, Send, UserRound } from "lucide-react";
import { searchSponsorTargets, proposeSponsorship, type SponsorTargetHit } from "@/app/business/actions";

const inputCls =
  "w-full rounded-[10px] border border-rule-2 bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/15";

/** Propose a sponsorship: pick a kind, find the target, set the terms.
 *  Player sponsorship exists in the engine (decision #6) but the surface is
 *  deliberately "Coming soon" — the tile says so and stays disabled. */
export function SponsorshipProposer({ businessId }: { businessId: string }) {
  const [kind, setKind] = useState<"event" | "team">("event");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<SponsorTargetHit[]>([]);
  const [target, setTarget] = useState<SponsorTargetHit | null>(null);
  const [label, setLabel] = useState("Sponsor");
  const [amount, setAmount] = useState("");
  const [description, setDescription] = useState("");
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();

  function runSearch(next: string) {
    setQ(next);
    setTarget(null);
    if (next.trim().length < 2) {
      setHits([]);
      return;
    }
    start(async () => {
      const res = await searchSponsorTargets(kind, next);
      setHits(res.hits);
    });
  }

  function submit() {
    if (!target) return;
    setMsg(null);
    start(async () => {
      const res = await proposeSponsorship({
        businessId,
        targetKind: kind,
        targetId: target.id,
        label,
        amountDollars: amount,
        description,
      });
      if (res.error) setMsg({ text: res.error });
      else {
        setMsg({ ok: true, text: "Proposal sent — the other side decides. Nothing shows until they approve." });
        setQ("");
        setHits([]);
        setTarget(null);
        setAmount("");
        setDescription("");
      }
    });
  }

  const kinds: { key: "event" | "team"; label: string; Icon: typeof CalendarDays }[] = [
    { key: "event", label: "Event", Icon: CalendarDays },
    { key: "team", label: "Team", Icon: Flag },
  ];

  return (
    <div className="mt-4 rounded-xl border border-rule bg-bg p-4">
      <p className="text-xs font-bold uppercase tracking-wider text-faint">Propose a sponsorship</p>

      <div className="mt-2 grid grid-cols-3 gap-2">
        {kinds.map(({ key, label: l, Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              setKind(key);
              setQ("");
              setHits([]);
              setTarget(null);
            }}
            className={`press flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-sm font-semibold transition-colors ${
              kind === key ? "border-brand bg-tint-brand/50 text-brand-deep" : "border-rule bg-surface text-ink hover:border-faint"
            }`}
          >
            <Icon size={15} /> {l}
          </button>
        ))}
        <div
          aria-disabled
          className="relative flex items-center justify-center gap-1.5 rounded-xl border border-dashed border-rule bg-surface px-3 py-2 text-sm font-semibold text-faint"
        >
          <UserRound size={15} /> Player
          <span className="absolute -top-2 right-2 rounded-full bg-ink px-1.5 py-0.5 font-mono text-[8px] font-bold uppercase tracking-wide text-cream">
            Coming soon
          </span>
        </div>
      </div>

      {!target ? (
        <div className="relative mt-3">
          <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-faint" />
          <input
            value={q}
            onChange={(e) => runSearch(e.target.value)}
            placeholder={kind === "event" ? "Find an event by name…" : "Find a team by name…"}
            className={`${inputCls} pl-9`}
          />
          {hits.length ? (
            <ul className="mt-1.5 overflow-hidden rounded-xl border border-rule bg-surface">
              {hits.map((h) => (
                <li key={h.id}>
                  <button
                    type="button"
                    onClick={() => setTarget(h)}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-bg"
                  >
                    <span className="min-w-0 truncate font-semibold text-ink">{h.name}</span>
                    {h.sub ? <span className="shrink-0 text-xs text-faint">{h.sub}</span> : null}
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : (
        <div className="mt-3 space-y-2.5">
          <div className="flex items-center justify-between gap-2 rounded-xl border border-brand/40 bg-tint-brand/40 px-3 py-2 text-sm">
            <span className="min-w-0 truncate font-semibold text-ink">{target.name}</span>
            <button type="button" onClick={() => setTarget(null)} className="press shrink-0 text-xs font-bold uppercase tracking-wide text-faint hover:text-ink">
              Change
            </button>
          </div>
          <div className="grid gap-2.5 sm:grid-cols-2">
            <input value={label} onChange={(e) => setLabel(e.target.value)} maxLength={60} placeholder="Label (e.g. Court sponsor)" className={inputCls} />
            <input value={amount} onChange={(e) => setAmount(e.target.value)} inputMode="decimal" placeholder="Amount, optional — on record only" className={inputCls} />
          </div>
          <textarea value={description} onChange={(e) => setDescription(e.target.value)} maxLength={400} rows={2} placeholder="What the sponsorship covers (optional)" className={inputCls} />
          <button
            type="button"
            onClick={submit}
            disabled={pending}
            className="press inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-cream hover:opacity-90 disabled:opacity-40"
          >
            {pending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Send proposal
          </button>
        </div>
      )}

      {msg ? (
        <p className={`mt-2.5 text-sm font-semibold ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p>
      ) : null}
      <p className="mt-2.5 text-[11px] leading-snug text-faint">
        Klimr records sponsorships — no money moves through the platform. Amounts you enter are a matter of record.
      </p>
    </div>
  );
}
