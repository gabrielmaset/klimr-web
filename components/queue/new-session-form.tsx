"use client";

import { useState, useTransition } from "react";
import { Loader2, MapPin } from "lucide-react";
import { SPORT_KEYS, sportMeta } from "@/lib/sports";
import { LEVELS, formationsFor, formationLabel } from "@/lib/queue";
import { createSession } from "@/app/queue/actions";

function getCoords(): Promise<{ lat: number; lng: number } | null> {
  return new Promise((resolve) => {
    if (typeof navigator === "undefined" || !navigator.geolocation) return resolve(null);
    navigator.geolocation.getCurrentPosition(
      (p) => resolve({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 8000 },
    );
  });
}

const WIN_RULES: { v: string; label: string }[] = [
  { v: "1", label: "Play once — re-form a new team every game" },
  { v: "2", label: "Winners stay until 2 wins, then re-form" },
  { v: "3", label: "Winners stay until 3 wins, then re-form" },
  { v: "5", label: "Winners stay until 5 wins, then re-form" },
];

function Toggle({ on, set, children }: { on: boolean; set: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={() => set(!on)} className="flex w-full items-center gap-3 rounded-2xl border border-rule bg-bg/40 px-4 py-3 text-left transition-colors hover:bg-bg">
      <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-brand" : "bg-rule"}`}>
        <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${on ? "translate-x-[22px]" : "translate-x-0.5"}`} />
      </span>
      <span className="text-sm text-ink-soft">{children}</span>
    </button>
  );
}

export function NewSessionForm({ eventId, defaultSport, defaultTitle }: { eventId: string | null; defaultSport: string; defaultTitle: string }) {
  const [title, setTitle] = useState(defaultTitle);
  const [sport, setSport] = useState(defaultSport);
  const forms = formationsFor(sport);
  const [size, setSize] = useState<number>(forms.includes(2) ? 2 : forms[0]);
  const [winCap, setWinCap] = useState("1");
  const [levels, setLevels] = useState<string[]>([]);
  const [allowGuests, setAllowGuests] = useState(true);
  const [requireLocation, setRequireLocation] = useState(false);
  const [requireApproval, setRequireApproval] = useState(false);
  const [allowFullTeams, setAllowFullTeams] = useState(false);
  const [eventOnly, setEventOnly] = useState(false);
  const [pending, start] = useTransition();
  const [err, setErr] = useState<string | null>(null);

  const changeSport = (s: string) => {
    setSport(s);
    const nf = formationsFor(s);
    if (!nf.includes(size)) setSize(nf.includes(2) ? 2 : nf[0]);
  };
  const toggleLevel = (k: string) => setLevels((cur) => (cur.includes(k) ? cur.filter((x) => x !== k) : [...cur, k]));

  const submit = () => {
    setErr(null);
    start(async () => {
      const f = new FormData();
      if (eventId) f.append("eventId", eventId);
      f.append("title", title.trim());
      f.append("sport", sport);
      f.append("winCap", winCap);
      f.append("courtSize", String(size));
      levels.forEach((l) => f.append("levels", l));
      if (allowGuests) f.append("allowGuests", "on");
      if (requireApproval) f.append("requireApproval", "on");
      if (allowFullTeams) f.append("allowFullTeams", "on");
      if (eventOnly) f.append("eventOnly", "on");
      if (requireLocation) {
        const coords = await getCoords();
        if (!coords) {
          setErr("Allow location access so we can pin the court's spot (or turn off on-site check), then try again.");
          return;
        }
        f.append("requireLocation", "on");
        f.append("centerLat", String(coords.lat));
        f.append("centerLng", String(coords.lng));
      }
      await createSession(f);
    });
  };

  return (
    <div className="mt-6 space-y-6 rounded-3xl border border-rule bg-surface shadow-e1 p-5 sm:p-6">
      <div>
        <label className="mb-1 block text-sm font-semibold text-ink">Session name</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Saturday beach volley" className="w-full rounded-xl border border-rule bg-white px-3 py-2.5 text-sm outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" />
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-ink">Sport</label>
        <select value={sport} onChange={(e) => changeSport(e.target.value)} className="w-full rounded-xl border border-rule bg-white px-3 py-2.5 text-sm">
          {SPORT_KEYS.map((k) => {
            const m = sportMeta(k);
            return (
              <option key={k} value={k}>
                {m.emoji} {m.name}
              </option>
            );
          })}
        </select>
      </div>

      <div>
        <label className="mb-1 block text-sm font-semibold text-ink">Win rule</label>
        <select value={winCap} onChange={(e) => setWinCap(e.target.value)} className="w-full rounded-xl border border-rule bg-white px-3 py-2.5 text-sm">
          {WIN_RULES.map((r) => (
            <option key={r.v} value={r.v}>
              {r.label}
            </option>
          ))}
        </select>
        <p className="mt-1 text-xs text-faint">King of the court: the losing team always re-forms; the winner keeps playing until it hits this many wins.</p>
      </div>

      <div className="border-t border-rule pt-5">
        <p className="text-sm font-semibold text-ink">First court</p>
        <p className="mb-3 text-xs text-faint">You can add more courts after you create the session.</p>
        <div>
          <label className="mb-1.5 block text-xs font-semibold text-mute">Formation</label>
          <div className="flex flex-wrap gap-2">
            {forms.map((n) => (
              <button
                key={n}
                type="button"
                onClick={() => setSize(n)}
                className={`rounded-full border px-4 py-2 text-sm font-bold transition-colors ${size === n ? "border-brand bg-brand text-white" : "border-rule bg-white text-ink-soft hover:border-brand"}`}
              >
                {formationLabel(n)}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <label className="mb-1.5 block text-xs font-semibold text-mute">Levels (optional)</label>
          <div className="flex flex-wrap gap-2">
            {LEVELS.map((l) => (
              <button
                key={l.key}
                type="button"
                onClick={() => toggleLevel(l.key)}
                className={`rounded-full border px-3 py-1.5 text-sm font-semibold transition-colors ${levels.includes(l.key) ? "border-brand bg-tint-brand text-brand-deep" : "border-rule bg-white text-ink-soft hover:border-brand"}`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-2 border-t border-rule pt-5">
        <Toggle on={allowGuests} set={setAllowGuests}>
          Allow walk-up sign-ups (no Klimr account — join by name)
        </Toggle>
        <Toggle on={requireLocation} set={setRequireLocation}>
          <span className="inline-flex items-center gap-1.5">
            <MapPin size={14} /> Verify players are on-site (within ~150m of the court)
          </span>
        </Toggle>
        <Toggle on={requireApproval} set={setRequireApproval}>
          Approve each player before they join the line
        </Toggle>
        <Toggle on={allowFullTeams} set={setAllowFullTeams}>
          Let players drop a complete team into the line at once
        </Toggle>
        {eventId ? (
          <Toggle on={eventOnly} set={setEventOnly}>
            Only players who RSVP&apos;d to this event can join <span className="text-faint">(turns off walk-ups)</span>
          </Toggle>
        ) : null}
      </div>

      {requireLocation ? <p className="text-xs text-mute">On-site check pins the court to <span className="font-semibold">your current location</span> when you create the session — so create it at the venue. We&apos;ll ask for location access.</p> : null}
      {err ? <p className="rounded-xl border border-[#fca5a5] bg-[#fef2f2] px-3 py-2 text-sm font-medium text-[#b91c1c]">{err}</p> : null}

      <button type="button" onClick={submit} disabled={pending || title.trim().length < 2} className="press inline-flex w-full items-center justify-center gap-2 rounded-full bg-brand py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-deep disabled:opacity-50 shadow-md shadow-brand/25">
        {pending ? <Loader2 size={16} className="animate-spin" /> : null} Create session
      </button>
    </div>
  );
}
