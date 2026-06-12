"use client";
import { useMemo, useState } from "react";
import { useActionState } from "react";
import { Check, Star } from "lucide-react";
import { saveProfile, type WizardState } from "./actions";

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

const SLOTS = [
  { key: "am", label: "Morning" },
  { key: "pm", label: "Afternoon" },
  { key: "eve", label: "Evening" },
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

export type WizardInitial = {
  displayName: string;
  zip: string;
  bio: string;
  gender: string;
  birthYear: string;
  hue: number;
  availability: string[];
  preferredFormat: string;
  playStyle: string;
  handedness: string;
  sports: { key: string; level: string; primary: boolean; rating: string }[];
};

type SportMeta = { key: string; name: string; skill_system: string | null };
type Picked = Record<string, { level: string; primary: boolean; rating: string }>;

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
}: {
  sports: SportMeta[];
  initial: WizardInitial;
  isEdit: boolean;
}) {
  const [state, formAction, pending] = useActionState(saveProfile, initialState);
  const [step, setStep] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);

  const [displayName, setDisplayName] = useState(initial.displayName);
  const [zip, setZip] = useState(initial.zip);
  const [picked, setPicked] = useState<Picked>(
    Object.fromEntries(
      initial.sports.map((s) => [s.key, { level: s.level, primary: s.primary, rating: s.rating }]),
    ),
  );
  const [format, setFormat] = useState(initial.preferredFormat || "both");
  const [style, setStyle] = useState(initial.playStyle || "both");
  const [hand, setHand] = useState(initial.handedness || "");
  const [avail, setAvail] = useState<Set<string>>(new Set(initial.availability));
  const [hue, setHue] = useState(initial.hue);
  const [bio, setBio] = useState(initial.bio);
  const [birthYear, setBirthYear] = useState(initial.birthYear);
  const [gender, setGender] = useState(initial.gender);

  const pickedKeys = Object.keys(picked);
  const initials = useMemo(
    () =>
      (displayName.trim() || "You")
        .split(/\s+/)
        .map((n) => n[0])
        .join("")
        .slice(0, 2)
        .toUpperCase(),
    [displayName],
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
        next[key] = { level: "casual", primary: Object.keys(next).length === 0, rating: "" };
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

  /* ---- availability helpers ---- */
  function toggleSlot(id: string) {
    setAvail((a) => {
      const next = new Set(a);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }
  const preset = (ids: string[]) => setAvail(new Set(ids));

  /* ---- navigation ---- */
  function next() {
    if (step === 0) {
      if (displayName.trim().length < 2) return setStepError("Enter your name — it appears on the board.");
      if (!/^\d{5}$/.test(zip)) return setStepError("Enter a 5-digit ZIP code.");
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

  const sportsJson = JSON.stringify(
    pickedKeys.map((key) => ({
      key,
      level: picked[key].level,
      primary: picked[key].primary,
      rating: picked[key].rating.trim(),
    })),
  );

  return (
    <form action={formAction} className="space-y-6">
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
            <label className="block">
              <span className="kicker text-faint">Your name</span>
              <input
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value.slice(0, 40))}
                onKeyDown={enterAdvances}
                placeholder="Alex Rivera"
                autoFocus
                className="mt-1.5 w-full rounded-xl border border-rule bg-surface px-3.5 py-3 text-[15px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand"
              />
              <span className="mt-1.5 block text-xs text-mute">
                This is how you appear on rankings and to other players.
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
                        <div className="flex items-center justify-between gap-2">
                          <label className="flex items-center gap-1.5">
                            <span className="kicker text-faint">{s.skill_system ?? "Rating"}</span>
                            <input
                              value={sel.rating}
                              onChange={(e) =>
                                setSport(s.key, {
                                  rating: e.target.value.replace(/[^\d.]/g, "").slice(0, 4),
                                })
                              }
                              inputMode="decimal"
                              placeholder={RATING_HINT[s.skill_system ?? ""] ?? "e.g. 4.0"}
                              className="w-20 rounded-lg border border-rule bg-surface px-2 py-1.5 font-mono text-[13px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand"
                            />
                          </label>
                          <button
                            type="button"
                            onClick={() => setPrimary(s.key)}
                            className={
                              "flex items-center gap-1 text-[11px] font-semibold transition-colors " +
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

        {/* ---- step 3 · how you play ---- */}
        {step === 2 ? (
          <div className="space-y-5">
            <div>
              <span className="kicker text-faint">Format</span>
              <PillRow options={FORMATS} value={format} onPick={setFormat} />
            </div>
            <div>
              <span className="kicker text-faint">Match style</span>
              <PillRow options={STYLES} value={style} onPick={setStyle} />
              <p className="mt-1.5 text-xs text-mute">
                Social matches are about the game; competitive ones are about the board. Both is a fine answer.
              </p>
            </div>
            <div>
              <span className="kicker text-faint">Racquet hand · optional</span>
              <PillRow options={HANDS} value={hand} onPick={setHand} allowNone />
            </div>
          </div>
        ) : null}

        {/* ---- step 4 · schedule ---- */}
        {step === 3 ? (
          <div className="space-y-3">
            <div className="overflow-hidden rounded-2xl border border-rule bg-surface">
              <div className="grid grid-cols-[3rem_repeat(3,1fr)] gap-px bg-rule">
                <div className="bg-surface" />
                {SLOTS.map((sl) => (
                  <div key={sl.key} className="kicker bg-surface px-1 py-2 text-center text-faint">
                    {sl.label}
                  </div>
                ))}
                {DAYS.map((d) => (
                  <div key={d.key} className="contents">
                    <div className="flex items-center bg-surface px-2.5 font-mono text-[11px] font-bold text-mute">
                      {d.label}
                    </div>
                    {SLOTS.map((sl) => {
                      const id = `${d.key}-${sl.key}`;
                      const on = avail.has(id);
                      return (
                        <button
                          key={id}
                          type="button"
                          aria-pressed={on}
                          aria-label={`${d.label} ${sl.label}`}
                          onClick={() => toggleSlot(id)}
                          className={"h-9 transition-colors " + (on ? "bg-ink" : "bg-surface hover:bg-bg")}
                        >
                          {on ? <span className="mx-auto block h-1.5 w-1.5 rounded-full bg-pop" /> : null}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => preset(DAYS.slice(0, 5).map((d) => `${d.key}-eve`))}
                className="press rounded-full border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-ink"
              >
                Weekday evenings
              </button>
              <button
                type="button"
                onClick={() => preset(["sat", "sun"].flatMap((d) => SLOTS.map((sl) => `${d}-${sl.key}`)))}
                className="press rounded-full border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-ink-soft transition-colors hover:border-ink"
              >
                Weekends
              </button>
              <button
                type="button"
                onClick={() => preset([])}
                className="press rounded-full border border-rule bg-surface px-3 py-1.5 text-xs font-semibold text-mute transition-colors hover:border-ink"
              >
                Clear
              </button>
            </div>
            <p className="text-xs text-mute">
              When are you usually free to play? Tap any block — change it anytime.
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

            <div className="grid grid-cols-2 gap-3">
              <label className="block">
                <span className="kicker text-faint">Birth year · optional</span>
                <input
                  value={birthYear}
                  onChange={(e) => setBirthYear(e.target.value.replace(/\D/g, "").slice(0, 4))}
                  inputMode="numeric"
                  placeholder="1990"
                  className="mt-1.5 w-full rounded-xl border border-rule bg-surface px-3.5 py-3 font-mono text-[15px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand"
                />
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
            </div>
            <p className="text-xs leading-relaxed text-mute">
              Used later for optional match filters, never shown without your
              say. Klimr is 18+ during the beta.
            </p>
          </div>
        ) : null}
      </div>

      {/* serialized payload */}
      <input type="hidden" name="display_name" value={displayName} />
      <input type="hidden" name="zip" value={zip} />
      <input type="hidden" name="sports_json" value={sportsJson} />
      <input type="hidden" name="preferred_format" value={format} />
      <input type="hidden" name="play_style" value={style} />
      <input type="hidden" name="handedness" value={hand} />
      <input type="hidden" name="availability_json" value={JSON.stringify([...avail])} />
      <input type="hidden" name="avatar_hue" value={hue} />
      <input type="hidden" name="bio" value={bio} />
      <input type="hidden" name="birth_year" value={birthYear} />
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
            type="button"
            onClick={next}
            className="press flex-1 rounded-xl bg-ink px-3.5 py-3 text-[15px] font-bold text-surface transition-colors hover:bg-ink-soft"
          >
            Continue
          </button>
        ) : (
          <button
            type="submit"
            disabled={pending}
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
