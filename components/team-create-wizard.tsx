"use client";

import { useActionState, useState, useTransition } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Loader2, MapPin, Users, Trophy, Minus, Plus } from "lucide-react";
import { createTeam, resolveTeamZip } from "@/app/teams/actions";
import { SPORTS, sportMeta, teamSizeFor } from "@/lib/sports";

const field =
  "w-full rounded-xl border border-rule bg-surface px-3.5 py-3 text-sm text-ink outline-none transition-colors focus:border-brand";
const labelCls = "mb-1.5 block text-xs font-semibold text-mute";

const TYPES = [
  {
    value: "recreational",
    title: "Recreational",
    tagline: "Casual crew or hitting group",
    body: "A clean, simple team page that lives right inside your account — perfect for friends and regular hitting partners. Results still count toward the rankings.",
    Icon: Users,
  },
  {
    value: "pro",
    title: "Pro",
    tagline: "Club, school, or competitive program",
    body: "Unlocks a full team workspace — public profile, roster, matches, and team chat — kept separate from your personal account. You switch into it from your top bar.",
    Icon: Trophy,
  },
];

const STEPS = ["Type", "Basics", "Location", "Review"];

export function TeamCreateWizard({ defaultZip }: { defaultZip: string }) {
  const [step, setStep] = useState(0);
  const [category, setCategory] = useState("recreational");
  const [name, setName] = useState("");
  const [sport, setSport] = useState("");
  const [size, setSize] = useState(2);
  const [zip, setZip] = useState(/^\d{5}$/.test(defaultZip) ? defaultZip : "");
  const [resolved, setResolved] = useState<{ city: string; state: string } | null>(null);
  const [zipError, setZipError] = useState<string | null>(null);
  const [resolving, startResolve] = useTransition();
  const [state, action, pending] = useActionState(createTeam, undefined);

  function onZip(v: string) {
    const z = v.replace(/\D/g, "").slice(0, 5);
    setZip(z);
    setResolved(null);
    setZipError(null);
    if (z.length === 5) {
      startResolve(async () => {
        const r = await resolveTeamZip(z);
        if (r) setResolved(r);
        else setZipError("That doesn't match a US ZIP code.");
      });
    }
  }

  const canNext =
    step === 0
      ? true
      : step === 1
        ? name.trim().length > 0 && sport.length > 0
        : step === 2
          ? zip.length === 5 && !!resolved
          : true;

  const sportLabel = sport ? `${sportMeta(sport).emoji} ${sportMeta(sport).name}` : "—";
  const typeLabel = TYPES.find((t) => t.value === category)?.title ?? "";

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:py-10">
      <Link href="/teams" className="press mb-4 inline-flex items-center gap-1 text-sm font-semibold text-mute transition-colors hover:text-ink">
        <ArrowLeft size={16} /> Teams
      </Link>
      <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Create a team</h1>
      <p className="mt-1 text-sm text-mute">A few quick steps and your team is live.</p>

      {/* Stepper */}
      <ol className="mt-6 flex items-center gap-2">
        {STEPS.map((label, i) => {
          const done = i < step;
          const active = i === step;
          return (
            <li key={label} className="flex flex-1 items-center gap-2">
              <span
                className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold transition-colors ${
                  done ? "bg-brand text-white" : active ? "bg-ink text-surface" : "bg-bg text-faint ring-1 ring-rule"
                }`}
              >
                {done ? <Check size={14} /> : i + 1}
              </span>
              <span className={`hidden text-xs font-semibold sm:inline ${active ? "text-ink" : "text-faint"}`}>{label}</span>
              {i < STEPS.length - 1 ? <span className={`h-px flex-1 ${done ? "bg-brand" : "bg-rule"}`} /> : null}
            </li>
          );
        })}
      </ol>

      <div className="mt-7 rounded-3xl border border-rule bg-surface p-5 sm:p-7">
        {/* Step 1 — Type */}
        {step === 0 ? (
          <div>
            <h2 className="font-display text-xl text-ink">What kind of team is this?</h2>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {TYPES.map((t) => {
                const sel = category === t.value;
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => setCategory(t.value)}
                    aria-pressed={sel}
                    className={`flex flex-col rounded-2xl border p-4 text-left transition-colors ${sel ? "border-brand bg-tint-brand" : "border-rule bg-bg hover:border-faint"}`}
                  >
                    <span className="flex items-center justify-between">
                      <span className={`grid h-9 w-9 place-items-center rounded-xl ${sel ? "bg-surface text-brand-deep" : "bg-surface text-mute"}`}>
                        <t.Icon size={18} />
                      </span>
                      <span className={`grid h-5 w-5 place-items-center rounded-full border ${sel ? "border-brand bg-brand text-white" : "border-rule bg-surface"}`}>
                        {sel ? <Check size={13} /> : null}
                      </span>
                    </span>
                    <span className="mt-3 text-sm font-bold text-ink">{t.title}</span>
                    <span className="mt-0.5 text-xs font-semibold text-brand-deep">{t.tagline}</span>
                    <span className="mt-1.5 text-xs leading-relaxed text-mute">{t.body}</span>
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        {/* Step 2 — Basics */}
        {step === 1 ? (
          <div className="space-y-4">
            <h2 className="font-display text-xl text-ink">The basics</h2>
            <div>
              <label className={labelCls} htmlFor="t-name">Team name</label>
              <input id="t-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus placeholder="e.g. Westside Smash" className={field} />
            </div>
            <div>
              <label className={labelCls} htmlFor="t-sport">Sport</label>
              <select
                id="t-sport"
                value={sport}
                onChange={(e) => {
                  const k = e.target.value;
                  setSport(k);
                  setSize(teamSizeFor(k).default);
                }}
                className={field}
              >
                <option value="" disabled>Choose a sport…</option>
                {SPORTS.map((s) => (
                  <option key={s.key} value={s.key}>{s.emoji} {s.name}</option>
                ))}
              </select>
              <p className="mt-1.5 text-xs text-faint">A team plays one sport, and this can&rsquo;t be changed later.</p>
            </div>
            {sport ? (
              <div>
                <label className={labelCls}>Squad size</label>
                <div className="flex flex-wrap items-center gap-3">
                  <div className="inline-flex items-center rounded-xl border border-rule bg-surface">
                    <button
                      type="button"
                      onClick={() => setSize((n) => Math.max(n - 1, teamSizeFor(sport).min))}
                      disabled={size <= teamSizeFor(sport).min}
                      aria-label="Fewer players"
                      className="press grid h-11 w-11 place-items-center text-ink transition-colors hover:bg-bg disabled:opacity-30"
                    >
                      <Minus size={16} />
                    </button>
                    <span className="w-12 text-center font-display text-lg text-ink tabular">{size}</span>
                    <button
                      type="button"
                      onClick={() => setSize((n) => Math.min(n + 1, teamSizeFor(sport).max))}
                      disabled={size >= teamSizeFor(sport).max}
                      aria-label="More players"
                      className="press grid h-11 w-11 place-items-center text-ink transition-colors hover:bg-bg disabled:opacity-30"
                    >
                      <Plus size={16} />
                    </button>
                  </div>
                  <p className="min-w-0 flex-1 text-xs text-mute">
                    Players on the roster — {teamSizeFor(sport).min}–{teamSizeFor(sport).max} for {sportMeta(sport).name.toLowerCase()}. This is the cap: invites stop once the team is full.
                  </p>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}

        {/* Step 3 — Location */}
        {step === 2 ? (
          <div className="space-y-4">
            <h2 className="font-display text-xl text-ink">Where&rsquo;s the team based?</h2>
            <p className="text-sm text-mute">Enter the home ZIP — we fill in the city and state for you. This places the team in the right local rankings.</p>
            <div className="grid gap-3 sm:grid-cols-[10rem_1fr]">
              <div>
                <label className={labelCls} htmlFor="t-zip">ZIP code</label>
                <input
                  id="t-zip"
                  value={zip}
                  onChange={(e) => onZip(e.target.value)}
                  inputMode="numeric"
                  autoComplete="postal-code"
                  placeholder="90066"
                  className={`${field} font-mono tracking-wider`}
                />
              </div>
              <div>
                <label className={labelCls}>City &amp; state</label>
                <div className="flex h-[46px] items-center gap-2 rounded-xl border border-rule bg-bg px-3.5 text-sm">
                  <MapPin size={15} className="shrink-0 text-faint" />
                  {resolving ? (
                    <span className="flex items-center gap-1.5 text-mute"><Loader2 size={14} className="animate-spin" /> Looking up…</span>
                  ) : resolved ? (
                    <span className="font-semibold text-ink">{resolved.city}, {resolved.state}</span>
                  ) : (
                    <span className="text-faint">Fills in from the ZIP</span>
                  )}
                </div>
              </div>
            </div>
            {zipError ? <p className="text-sm text-brand-deep">{zipError}</p> : null}
          </div>
        ) : null}

        {/* Step 4 — Review */}
        {step === 3 ? (
          <div>
            <h2 className="font-display text-xl text-ink">Review &amp; create</h2>
            <dl className="mt-4 divide-y divide-rule rounded-2xl border border-rule">
              <Row label="Type" value={typeLabel} />
              <Row label="Name" value={name} />
              <Row label="Sport" value={sportLabel} />
              <Row label="Squad size" value={`Up to ${size} players`} />
              <Row label="Location" value={resolved ? `${resolved.city}, ${resolved.state} · ${zip}` : zip} />
            </dl>
            {category === "pro" ? (
              <p className="mt-3 rounded-xl bg-tint-brand px-3.5 py-2.5 text-xs text-brand-deep">
                You&rsquo;ll land in your new team workspace. Switch back to your personal account anytime from the top bar.
              </p>
            ) : null}

            <form action={action} className="mt-5 flex flex-wrap items-center gap-2">
              <input type="hidden" name="category" value={category} />
              <input type="hidden" name="name" value={name} />
              <input type="hidden" name="sport_key" value={sport} />
              <input type="hidden" name="max_size" value={size} />
              <input type="hidden" name="zip" value={zip} />
              <button
                type="submit"
                disabled={pending}
                className="press inline-flex items-center gap-1.5 rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
              >
                {pending ? (<><Loader2 size={14} className="animate-spin" /> Creating…</>) : "Create team"}
              </button>
              <button type="button" onClick={() => setStep(2)} className="press rounded-full border border-rule px-4 py-2.5 text-sm font-semibold text-mute transition-colors hover:text-ink">
                Back
              </button>
              {state?.error ? <span className="text-sm text-brand-deep">{state.error}</span> : null}
            </form>
          </div>
        ) : null}

        {/* Nav for steps 1–3 */}
        {step < 3 ? (
          <div className="mt-7 flex items-center justify-between border-t border-rule pt-5">
            <button
              type="button"
              onClick={() => setStep((s) => Math.max(s - 1, 0))}
              disabled={step === 0}
              className="press inline-flex items-center gap-1 rounded-full px-3 py-2 text-sm font-semibold text-mute transition-colors hover:text-ink disabled:invisible"
            >
              <ArrowLeft size={16} /> Back
            </button>
            <button
              type="button"
              onClick={() => canNext && setStep((s) => Math.min(s + 1, STEPS.length - 1))}
              disabled={!canNext}
              className="press inline-flex items-center gap-1.5 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft disabled:opacity-50"
            >
              Continue <ArrowRight size={16} />
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 px-4 py-3">
      <dt className="text-xs font-semibold uppercase tracking-wide text-faint">{label}</dt>
      <dd className="min-w-0 truncate text-right text-sm font-semibold text-ink">{value || "—"}</dd>
    </div>
  );
}
