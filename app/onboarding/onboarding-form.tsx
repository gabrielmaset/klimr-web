"use client";
import { useMemo, useRef, useState } from "react";
import { useActionState } from "react";
import { Check, Plus, Star, X } from "lucide-react";
import { saveProfile, type WizardState } from "./actions";
import { ageFromDob } from "@/lib/age";

/* ---------- vocabulary ---------- */

const SPORT_EMOJI: Record<string, string> = {
  tennis: "🎾",
  pickleball: "🏓",
  padel: "🟡",
  racquetball: "🟦",
};

const LEVELS = [
  { key: "new", label: "New", blurb: "Just getting started." },
  { key: "casual", label: "Casual", blurb: "Plays regularly, mostly for fun." },
  { key: "competitive", label: "Competitive", blurb: "Consistent and tactical — plays to win." },
  { key: "advanced", label: "Advanced", blurb: "Tournament-level game." },
] as const;

const RATING_HINT: Record<string, string> = {
  NTRP: "e.g. 3.5",
  DUPR: "e.g. 3.5",
  Level: "e.g. 3.0",
  USAR: "e.g. 4.0",
};

const DAYS = [
  { key: "mon", label: "Mon" },
  { key: "tue", label: "Tue" },
  { key: "wed", label: "Wed" },
  { key: "thu", label: "Thu" },
  { key: "fri", label: "Fri" },
  { key: "sat", label: "Sat" },
  { key: "sun", label: "Sun" },
] as const;

const HUES = [12, 35, 95, 150, 200, 235, 280, 330];

const STEPS = ["About you", "Your sports", "How you play", "When you play", "Finishing touches"];

type PillOption = { value: string; label: string };
const FORMATS: PillOption[] = [
  { value: "singles", label: "Singles" },
  { value: "doubles", label: "Doubles" },
  { value: "both", label: "Both" },
];
const STYLES: PillOption[] = [
  { value: "social", label: "Mostly social" },
  { value: "competitive", label: "Mostly competitive" },
  { value: "both", label: "Both" },
];
const HANDS: PillOption[] = [
  { value: "right", label: "Right" },
  { value: "left", label: "Left" },
  { value: "either", label: "Either" },
];

/* ---------- time helpers (15-minute schedule) ---------- */

type TimeOpt = { value: string; label: string };
const TIME_OPTS: TimeOpt[] = (() => {
  const out: TimeOpt[] = [];
  for (let m = 0; m < 24 * 60; m += 15) {
    const h = Math.floor(m / 60);
    const mm = m % 60;
    const value = `${String(h).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    const ampm = h < 12 ? "AM" : "PM";
    const h12 = h % 12 === 0 ? 12 : h % 12;
    out.push({ value, label: `${h12}:${String(mm).padStart(2, "0")} ${ampm}` });
  }
  return out;
})();
const timeLabel = (v: string) => TIME_OPTS.find((t) => t.value === v)?.label ?? v;
const toMin = (v: string) => {
  const [h, m] = v.split(":").map(Number);
  return h * 60 + m;
};

type Range = { day: string; start: string; end: string };

export type WizardInitial = {
  firstName: string;
  lastName: string;
  zip: string;
  bio: string;
  gender: string;
  dob: string;
  hue: number;
  availability: Range[];
  playStyle: string;
  sports: {
    key: string;
    level: string;
    primary: boolean;
    rating: string;
    format: string;
    hand: string;
  }[];
};

type SportMeta = { key: string; name: string; skill_system: string | null };
type Picked = Record<
  string,
  { level: string; primary: boolean; rating: string; format: string; hand: string }
>;

const initialState: WizardState = {};

/* ---------- small shared pieces ---------- */

function PillRow({
  options,
  value,
  onPick,
  allowNone,
}: {
  options: PillOption[];
  value: string;
  onPick: (v: string) => void;
  allowNone?: boolean;
}) {
  return (
    <div className="mt-2 flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value === o.value;
        return (
          <button
            key={o.value}
            type="button"
            aria-pressed={on}
            onClick={() => onPick(allowNone && on ? "" : o.value)}
            className={
              "press rounded-full border px-3.5 py-2 text-sm font-semibold transition-colors " +
              (on
                ? "border-ink bg-ink text-pop"
                : "border-rule bg-surface text-mute hover:text-ink")
            }
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

/* ---------- wizard ---------- */

export function OnboardingWizard({
  sports,
  initial,
  isEdit,
  startStep = 0,
}: {
  sports: SportMeta[];
  initial: WizardInitial;
  isEdit: boolean;
  startStep?: number;
}) {
  const [state, formAction, pending] = useActionState(saveProfile, initialState);
  const [step, setStep] = useState(Math.min(Math.max(startStep, 0), STEPS.length - 1));
  const [stepError, setStepError] = useState<string | null>(null);
  const submitIntent = useRef(false);

  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [zip, setZip] = useState(initial.zip);
  const [picked, setPicked] = useState<Picked>(
    Object.fromEntries(
      initial.sports.map((s) => [
        s.key,
        {
          level: s.level,
          primary: s.primary,
          rating: s.rating,
          format: s.format || "both",
          hand: s.hand || "",
        },
      ]),
    ),
  );
  const [style, setStyle] = useState(initial.playStyle || "both");
  const [ranges, setRanges] = useState<Range[]>(initial.availability);
  const [addingDay, setAddingDay] = useState<string | null>(null);
  const [draftStart, setDraftStart] = useState("18:00");
  const [draftEnd, setDraftEnd] = useState("21:00");
  const [hue, setHue] = useState(initial.hue);
  const [bio, setBio] = useState(initial.bio);
  const [dob, setDob] = useState(initial.dob);
  const [gender, setGender] = useState(initial.gender);

  const pickedKeys = Object.keys(picked);
  const sportName = (k: string) => sports.find((s) => s.key === k)?.name ?? k;
  const initials = useMemo(
    () =>
      `${(firstName.trim()[0] ?? "")}${(lastName.trim()[0] ?? "")}`.toUpperCase() || "Y",
    [firstName, lastName],
  );

  /* ---- sport helpers ---- */
  function toggleSport(key: string) {
    setPicked((p) => {
      const next = { ...p };
      if (next[key]) {
        const wasPrimary = next[key].primary;
        delete next[key];
        const rest = Object.keys(next);
        if (wasPrimary && rest.length) next[rest[0]] = { ...next[rest[0]], primary: true };
      } else {
        next[key] = {
          level: "casual",
          primary: Object.keys(next).length === 0,
          rating: "",
          format: "both",
          hand: "",
        };
      }
      return next;
    });
  }
  const setSport = (key: string, patch: Partial<Picked[string]>) =>
    setPicked((p) => ({ ...p, [key]: { ...p[key], ...patch } }));
  const setPrimary = (key: string) =>
    setPicked((p) =>
      Object.fromEntries(Object.entries(p).map(([k, v]) => [k, { ...v, primary: k === key }])),
    );

  /* ---- schedule helpers ---- */
  function addRange(day: string) {
    if (toMin(draftStart) >= toMin(draftEnd)) return;
    setRanges((rs) => {
      if (rs.some((r) => r.day === day && r.start === draftStart && r.end === draftEnd)) return rs;
      return [...rs, { day, start: draftStart, end: draftEnd }];
    });
    setAddingDay(null);
  }
  const removeRange = (idx: number) => setRanges((rs) => rs.filter((_, i) => i !== idx));
  const openAdder = (day: string) => {
    setDraftStart("18:00");
    setDraftEnd("21:00");
    setAddingDay(day);
  };

  /* ---- navigation ---- */
  function next() {
    if (step === 0) {
      if (firstName.trim().length < 2) return setStepError("Enter your first name.");
      if (lastName.trim().length < 2) return setStepError("Enter your last name.");
      if (!/^\d{5}$/.test(zip)) return setStepError("Enter a 5-digit ZIP code.");
      if (!dob) return setStepError("Enter your date of birth.");
      const age = ageFromDob(dob);
      if (age === null) return setStepError("Enter a valid date of birth.");
      if (age < 18) return setStepError("You must be 18 or older to join Klimr.");
      if (age > 120) return setStepError("Enter a valid date of birth.");
    }
    if (step === 1) {
      if (pickedKeys.length === 0) return setStepError("Pick at least one sport.");
      for (const k of pickedKeys) {
        const r = picked[k].rating.trim();
        if (r && !/^\d{1,2}(\.\d)?$/.test(r)) {
          return setStepError("Ratings look like 3.5 or 18 — or leave them blank.");
        }
      }
    }
    setStepError(null);
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }
  function back() {
    setStepError(null);
    setStep((s) => Math.max(s - 1, 0));
  }
  const enterAdvances = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      e.preventDefault();
      next();
    }
  };

  // The form may ONLY submit from an explicit click on the final step's button.
  // This stops the Continue->Submit button (rendered in the same slot) from
  // firing a save the instant the user lands on the last step, and blocks any
  // stray Enter-key submission on earlier steps.
  const onSubmit = (e: React.FormEvent) => {
    if (step !== STEPS.length - 1 || !submitIntent.current) e.preventDefault();
    submitIntent.current = false;
  };

  const sportsJson = JSON.stringify(
    pickedKeys.map((key) => ({
      key,
      level: picked[key].level,
      primary: picked[key].primary,
      rating: picked[key].rating.trim(),
      format: picked[key].format,
      hand: picked[key].hand,
    })),
  );

  return (
    <form action={formAction} onSubmit={onSubmit} className="space-y-6">
      {/* progress */}
      <div>
        <div className="flex items-baseline justify-between">
          <span className="kicker text-brand-deep">
            Step {step + 1} of {STEPS.length}
          </span>
          <span className="kicker text-faint">{STEPS[step]}</span>
        </div>
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-rule">
          <div
            className="h-full rounded-full bg-brand transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>
      </div>

      <div key={step} className="rise">
        {/* ---- step 1 · about you ---- */}
        {step === 0 ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="kicker text-faint">First name</span>
                <input
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value.slice(0, 40))}
                  onKeyDown={enterAdvances}
                  placeholder="Alex"
                  autoFocus
                  className="mt-1.5 w-full rounded-xl border border-rule bg-surface px-3.5 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand"
                />
              </label>
              <label className="block">
                <span className="kicker text-faint">Last name</span>
                <input
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value.slice(0, 40))}
                  onKeyDown={enterAdvances}
                  placeholder="Rivera"
                  className="mt-1.5 w-full rounded-xl border border-rule bg-surface px-3.5 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand"
                />
              </label>
            </div>
            <p className="-mt-1 text-xs text-mute">
              Only your first name is shown to other players. Your full name verifies your identity.
            </p>
            <label className="block">
              <span className="kicker text-faint">Date of birth</span>
              <input
                type="date"
                value={dob}
                onChange={(e) => setDob(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-rule bg-surface px-3.5 py-3 text-[15px] text-ink outline-none transition-colors focus:border-brand"
              />
              <span className="mt-1.5 block text-xs text-mute">
                Klimr is 18+. Your age is shown on your profile; your full date of birth is not.
              </span>
            </label>
            <label className="block">
              <span className="kicker text-faint">Home ZIP</span>
              <input
                value={zip}
                onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))}
                onKeyDown={enterAdvances}
                inputMode="numeric"
                placeholder="90066"
                className="mt-1.5 w-full rounded-xl border border-rule bg-surface px-3.5 py-3 font-mono text-lg tracking-[0.2em] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand"
              />
              <span className="mt-1.5 block text-xs text-mute">
                Your home board. Rankings start at the ZIP level.
              </span>
            </label>
            <div className="rounded-xl border border-rule bg-bg p-3.5">
              <p className="text-xs leading-relaxed text-mute">
                <span className="font-semibold text-ink">Your information is private.</span> Your name, date of birth, and ZIP
                are kept confidential and stored encrypted. We never sell your personal information and never share these
                details with other members. See our{" "}
                <a href="/legal" target="_blank" className="font-semibold text-brand-deep underline underline-offset-2">Privacy policy</a>.
              </p>
            </div>
          </div>
        ) : null}

        {/* ---- step 2 · sports ---- */}
        {step === 1 ? (
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
              {sports.map((s) => {
                const sel = picked[s.key];
                const levelBlurb = sel ? LEVELS.find((l) => l.key === sel.level)?.blurb : null;
                return (
                  <div
                    key={s.key}
                    role="checkbox"
                    aria-checked={!!sel}
                    tabIndex={0}
                    onClick={() => toggleSport(s.key)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        toggleSport(s.key);
                      }
                    }}
                    className={
                      "lift relative cursor-pointer rounded-2xl border p-3.5 transition-colors " +
                      (sel ? "border-ink bg-surface" : "border-rule bg-surface")
                    }
                  >
                    {sel ? (
                      <span className="absolute right-2.5 top-2.5 grid h-5 w-5 place-items-center rounded-full bg-brand">
                        <Check size={12} strokeWidth={3} className="text-white" aria-hidden />
                      </span>
                    ) : null}
                    <div className="flex items-center gap-2.5">
                      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-bg text-xl" aria-hidden>
                        {SPORT_EMOJI[s.key] ?? "•"}
                      </div>
                      <div className="text-sm font-bold text-ink">{s.name}</div>
                    </div>
                    {sel ? (
                      <div className="mt-3 space-y-2.5" onClick={(e) => e.stopPropagation()}>
                        <div>
                          <div className="flex flex-wrap gap-1">
                            {LEVELS.map((l) => (
                              <button
                                key={l.key}
                                type="button"
                                onClick={() => setSport(s.key, { level: l.key })}
                                className={
                                  "kicker rounded-full border px-2 py-1 transition-colors " +
                                  (sel.level === l.key
                                    ? "border-ink bg-ink text-pop"
                                    : "border-rule bg-surface text-mute hover:text-ink")
                                }
                              >
                                {l.label}
                              </button>
                            ))}
                          </div>
                          {levelBlurb ? (
                            <p className="mt-1.5 text-[11px] leading-snug text-mute">{levelBlurb}</p>
                          ) : null}
                        </div>
                        <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
                          <label className="flex min-w-0 items-center gap-1.5">
                            <span className="kicker shrink-0 text-faint">{s.skill_system ?? "Rating"}</span>
                            <input
                              value={sel.rating}
                              onChange={(e) =>
                                setSport(s.key, {
                                  rating: e.target.value.replace(/[^\d.]/g, "").slice(0, 4),
                                })
                              }
                              inputMode="decimal"
                              placeholder={RATING_HINT[s.skill_system ?? ""] ?? "e.g. 4.0"}
                              className="w-16 rounded-lg border border-rule bg-surface px-2 py-1.5 font-mono text-[13px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => setPrimary(s.key)}
                            className={
                              "flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] font-semibold transition-colors " +
                              (sel.primary ? "text-brand-deep" : "text-faint hover:text-mute")
                            }
                          >
                            <Star size={11} fill={sel.primary ? "currentColor" : "none"} aria-hidden />
                            {sel.primary ? "Primary" : "Make primary"}
                          </button>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <p className="text-xs text-mute">
              Pick everything you play — each sport gets its own ranking. Know
              your NTRP, DUPR, or USAR? Add it; leave it blank if not.
            </p>
          </div>
        ) : null}

        {/* ---- step 3 · how you play (per sport) ---- */}
        {step === 2 ? (
          <div className="space-y-5">
            {pickedKeys.length > 1 ? (
              <p className="text-xs text-mute">
                Set these per sport — your format and hand can differ between them.
              </p>
            ) : null}
            {pickedKeys.map((key) => (
              <div key={key} className="rounded-2xl border border-rule bg-bg/50 p-4">
                <div className="flex items-center gap-2">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-surface text-lg" aria-hidden>
                    {SPORT_EMOJI[key] ?? "•"}
                  </span>
                  <span className="text-sm font-bold text-ink">{sportName(key)}</span>
                </div>
                <div className="mt-3">
                  <span className="kicker text-faint">Format</span>
                  <PillRow
                    options={FORMATS}
                    value={picked[key].format}
                    onPick={(v) => setSport(key, { format: v })}
                  />
                </div>
                <div className="mt-3">
                  <span className="kicker text-faint">Racquet hand · optional</span>
                  <PillRow
                    options={HANDS}
                    value={picked[key].hand}
                    onPick={(v) => setSport(key, { hand: v })}
                    allowNone
                  />
                </div>
              </div>
            ))}
            <div>
              <span className="kicker text-faint">Match style</span>
              <PillRow options={STYLES} value={style} onPick={setStyle} />
              <p className="mt-1.5 text-xs text-mute">
                Social matches are about the game; competitive ones are about the board. Both is a fine answer.
              </p>
            </div>
          </div>
        ) : null}

        {/* ---- step 4 · schedule (15-minute blocks per day) ---- */}
        {step === 3 ? (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-2xl border border-rule bg-surface">
              <div className="divide-y divide-rule">
                {DAYS.map((d) => {
                  const dayRanges = ranges
                    .map((r, i) => ({ ...r, i }))
                    .filter((r) => r.day === d.key);
                  const adding = addingDay === d.key;
                  const invalid = toMin(draftStart) >= toMin(draftEnd);
                  return (
                    <div key={d.key} className="px-3 py-3 sm:px-4">
                      <div className="flex items-start gap-3">
                        <span className="mt-1 w-9 shrink-0 font-mono text-[12px] font-bold text-ink-soft">
                          {d.label}
                        </span>
                        <div className="flex flex-1 flex-wrap items-center gap-1.5">
                          {dayRanges.length === 0 && !adding ? (
                            <span className="text-[12px] text-faint">Not available</span>
                          ) : null}
                          {dayRanges.map((r) => (
                            <span
                              key={r.i}
                              className="inline-flex items-center gap-1 rounded-full border border-rule bg-bg py-1 pl-2.5 pr-1.5 text-[12px] font-semibold text-ink"
                            >
                              {timeLabel(r.start)} – {timeLabel(r.end)}
                              <button
                                type="button"
                                onClick={() => removeRange(r.i)}
                                aria-label={`Remove ${d.label} ${timeLabel(r.start)} to ${timeLabel(r.end)}`}
                                className="press grid h-4 w-4 place-items-center rounded-full text-mute transition-colors hover:bg-rule hover:text-brand-deep"
                              >
                                <X size={11} strokeWidth={2.5} aria-hidden />
                              </button>
                            </span>
                          ))}
                          {!adding ? (
                            <button
                              type="button"
                              onClick={() => openAdder(d.key)}
                              className="press inline-flex items-center gap-1 rounded-full border border-dashed border-rule px-2.5 py-1 text-[12px] font-semibold text-mute transition-colors hover:border-ink hover:text-ink"
                            >
                              <Plus size={12} strokeWidth={2.5} aria-hidden /> Add time
                            </button>
                          ) : null}
                        </div>
                      </div>
                      {adding ? (
                        <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-12">
                          <select
                            value={draftStart}
                            onChange={(e) => setDraftStart(e.target.value)}
                            aria-label="Start time"
                            className="rounded-lg border border-rule bg-surface px-2 py-1.5 text-[13px] text-ink outline-none transition-colors focus:border-brand"
                          >
                            {TIME_OPTS.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                          <span className="text-[13px] text-mute">to</span>
                          <select
                            value={draftEnd}
                            onChange={(e) => setDraftEnd(e.target.value)}
                            aria-label="End time"
                            className="rounded-lg border border-rule bg-surface px-2 py-1.5 text-[13px] text-ink outline-none transition-colors focus:border-brand"
                          >
                            {TIME_OPTS.map((t) => (
                              <option key={t.value} value={t.value}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                          <button
                            type="button"
                            onClick={() => addRange(d.key)}
                            disabled={invalid}
                            className="press rounded-lg bg-ink px-3 py-1.5 text-[13px] font-bold text-surface transition-colors hover:bg-ink-soft disabled:opacity-40"
                          >
                            Add
                          </button>
                          <button
                            type="button"
                            onClick={() => setAddingDay(null)}
                            className="press text-[13px] text-mute transition-colors hover:text-ink"
                          >
                            Cancel
                          </button>
                          {invalid ? (
                            <span className="w-full text-[11px] text-brand-deep">
                              End time must be after the start.
                            </span>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() =>
                  setRanges(DAYS.slice(0, 5).map((d) => ({ day: d.key, start: "18:00", end: "21:00" })))
                }
                className="press rounded-full border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-ink"
              >
                Weekday evenings
              </button>
              <button
                type="button"
                onClick={() =>
                  setRanges(["sat", "sun"].map((d) => ({ day: d, start: "09:00", end: "12:00" })))
                }
                className="press rounded-full border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-ink"
              >
                Weekend mornings
              </button>
              <button
                type="button"
                onClick={() => {
                  setRanges([]);
                  setAddingDay(null);
                }}
                className="press rounded-full border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-mute transition-colors hover:border-ink"
              >
                Clear
              </button>
            </div>
            <p className="text-xs text-mute">
              Add the times you’re usually free, in 15-minute steps — as many blocks per day as you like. Change them anytime.
            </p>
          </div>
        ) : null}

        {/* ---- step 5 · finishing touches ---- */}
        {step === 4 ? (
          <div className="space-y-5">
            <div className="flex items-center gap-4 rounded-2xl border border-rule bg-surface p-4">
              <div
                aria-hidden
                className="grid h-14 w-14 shrink-0 place-items-center rounded-full font-display text-xl text-surface"
                style={{
                  background: `linear-gradient(145deg, hsl(${hue},85%,62%) 0%, hsl(${(hue + 22) % 360},80%,48%) 100%)`,
                }}
              >
                {initials}
              </div>
              <div>
                <div className="kicker text-faint">Your color</div>
                <div className="mt-2 flex gap-1.5">
                  {HUES.map((h) => (
                    <button
                      key={h}
                      type="button"
                      aria-label={`Color ${h}`}
                      onClick={() => setHue(h)}
                      className={
                        "h-6 w-6 rounded-full transition-transform " +
                        (hue === h
                          ? "scale-110 ring-2 ring-ink ring-offset-2 ring-offset-surface"
                          : "hover:scale-105")
                      }
                      style={{
                        background: `linear-gradient(145deg, hsl(${h},85%,62%) 0%, hsl(${(h + 22) % 360},80%,48%) 100%)`,
                      }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <label className="block">
              <span className="kicker text-faint">Bio · optional</span>
              <textarea
                value={bio}
                onChange={(e) => setBio(e.target.value.slice(0, 160))}
                rows={2}
                placeholder="Weekend pickleball, always up for a rally."
                className="mt-1.5 w-full resize-none rounded-xl border border-rule bg-surface px-3.5 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand"
              />
              <span className="mt-1 block text-right font-mono text-[10px] text-faint">{bio.length}/160</span>
            </label>

            <label className="block">
              <span className="kicker text-faint">Gender · optional</span>
              <select
                value={gender}
                onChange={(e) => setGender(e.target.value)}
                className="mt-1.5 w-full rounded-xl border border-rule bg-surface px-3 py-3 text-[15px] text-ink outline-none transition-colors focus:border-brand"
              >
                <option value="">Prefer not to say</option>
                <option value="woman">Woman</option>
                <option value="man">Man</option>
                <option value="nonbinary">Non-binary</option>
              </select>
            </label>
            <p className="text-xs leading-relaxed text-mute">
              Gender is used only for optional match filters and is never shown without your say.
            </p>
          </div>
        ) : null}
      </div>

      {/* serialized payload */}
      <input type="hidden" name="display_name" value={firstName.trim()} />
      <input type="hidden" name="first_name" value={firstName.trim()} />
      <input type="hidden" name="last_name" value={lastName.trim()} />
      <input type="hidden" name="zip" value={zip} />
      <input type="hidden" name="sports_json" value={sportsJson} />
      <input type="hidden" name="play_style" value={style} />
      <input type="hidden" name="availability_json" value={JSON.stringify(ranges)} />
      <input type="hidden" name="avatar_hue" value={hue} />
      <input type="hidden" name="bio" value={bio} />
      <input type="hidden" name="dob" value={dob} />
      <input type="hidden" name="gender" value={gender} />

      {/* nav */}
      <div className="flex items-center gap-3">
        {step > 0 ? (
          <button
            type="button"
            onClick={back}
            className="press rounded-xl border border-rule bg-surface px-4 py-3 text-sm font-semibold text-ink transition-colors hover:border-ink"
          >
            Back
          </button>
        ) : null}
        {step < STEPS.length - 1 ? (
          <button
            key="continue"
            type="button"
            onClick={next}
            className="press flex-1 rounded-xl bg-ink px-3.5 py-3 text-[15px] font-bold text-surface transition-colors hover:bg-ink-soft"
          >
            Continue
          </button>
        ) : (
          <button
            key="finish"
            type="submit"
            disabled={pending}
            onClick={() => {
              submitIntent.current = true;
            }}
            className="press flex-1 rounded-xl bg-brand px-3.5 py-3 text-[15px] font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-60"
          >
            {pending ? "Saving…" : isEdit ? "Save profile" : "Finish profile"}
          </button>
        )}
      </div>
      <div aria-live="polite">
        {stepError || state.error ? (
          <p role="alert" className="text-sm text-brand-deep">
            {stepError ?? state.error}
          </p>
        ) : null}
      </div>
    </form>
  );
}
