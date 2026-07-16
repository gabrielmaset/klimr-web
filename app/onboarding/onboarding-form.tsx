"use client";
import { useMemo, useRef, useState } from "react";
import { useActionState } from "react";
import Link from "next/link";
import { Check, Pencil, Plus, ShieldCheck, Star, X } from "lucide-react";
import { saveProfile, type WizardState } from "./actions";
import { AvatarUploader } from "@/components/avatar-uploader";
import { ageFromDob } from "@/lib/age";
import { sportFormats, sportFormatFixed, sportHandLabel, playFormatLabel } from "@/lib/sport-play-options";

/* ---------- vocabulary ---------- */

const SPORT_EMOJI: Record<string, string> = {
  tennis: "🎾",
  pickleball: "🏓",
  padel: "🟡",
  racquetball: "🟦",
  beach_volleyball: "🏐",
};

const LEVELS = [
  { key: "new", label: "New", blurb: "Just getting started." },
  { key: "casual", label: "Casual", blurb: "Plays regularly, mostly for fun." },
  { key: "competitive", label: "Competitive", blurb: "Consistent and tactical — plays to win." },
  { key: "advanced", label: "Advanced", blurb: "Tournament-level game." },
] as const;

const RATING_HINT: Record<string, string> = { NTRP: "e.g. 3.5", DUPR: "e.g. 3.5", Level: "e.g. 3.0", USAR: "e.g. 4.0" };

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

const STEPS = ["About you", "Your sports", "When you play", "Finishing touches", "Review & confirm"];
const HEADS: { h: string; sub: string }[] = [
  { h: "First, the basics", sub: "The name and face on your player card — and where home base is." },
  { h: "Build your lineup", sub: "Pick a sport, set how you show up on court, add it — one at a time." },
  { h: "When are you usually free?", sub: "Set your usual windows so matches can find you." },
  { h: "Make it yours", sub: "A line about your game — and anything else you want on the card." },
  { h: "Everything look right?", sub: "Your whole profile is in the rail on the left — tap Edit on any card." },
];
const SPORT_TINT: Record<string, string> = {
  tennis: "#EAF5E4",
  pickleball: "#FDEFF4",
  padel: "#FFF6DF",
  racquetball: "#E9F0FE",
  beach_volleyball: "#F3ECFC",
};

const STYLES = [
  { value: "social", label: "Mostly social", blurb: "It's about the game and the people." },
  { value: "competitive", label: "Mostly competitive", blurb: "It's about the board." },
  { value: "both", label: "Both", blurb: "A fine answer." },
];
const HANDS = [
  { value: "", label: "No preference", blurb: "" },
  { value: "right", label: "Right", blurb: "" },
  { value: "left", label: "Left", blurb: "" },
  { value: "either", label: "Either", blurb: "Ambidextrous — a rare weapon." },
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
  sports: { key: string; level: string; primary: boolean; rating: string; format: string; hand: string }[];
};

type SportMeta = { key: string; name: string; skill_system: string | null };
type SportConfig = { level: string; primary: boolean; rating: string; format: string; hand: string };
type Picked = Record<string, SportConfig>;

const initialState: WizardState = {};

/* ---------- shared pieces ---------- */

/** Radio row — the wizard's option grammar (no pills). */
function OptionRow({ active, label, blurb, onPick }: { active: boolean; label: string; blurb?: string; onPick: () => void }) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onPick}
      className="press flex w-full items-center gap-3 px-3.5 py-3 text-left transition-colors hover:bg-bg"
    >
      <span className={`grid h-[18px] w-[18px] shrink-0 place-items-center rounded-full border-2 transition-colors ${active ? "border-ink" : "border-[#CDC3AE]"} bg-surface`}>
        {active ? <span className="h-2 w-2 rounded-full bg-ink" /> : null}
      </span>
      <span className="min-w-0 flex-1">
        <span className={`block text-[15px] leading-tight ${active ? "font-bold text-ink" : "font-semibold text-ink-soft"}`}>{label}</span>
        {blurb ? <span className="mt-0.5 block text-[13px] leading-snug text-mute">{blurb}</span> : null}
      </span>
    </button>
  );
}

function OptionGroup({ label, children, optional }: { label: string; children: React.ReactNode; optional?: boolean }) {
  return (
    <div>
      <p className="mb-1.5 text-[13px] font-bold uppercase tracking-[.08em] text-faint">
        {label}
        {optional ? <span className="ml-1.5 font-semibold normal-case tracking-normal text-faint/80">· optional</span> : null}
      </p>
      <div className="divide-y divide-rule-soft overflow-hidden rounded-2xl border border-rule bg-surface" role="radiogroup" aria-label={label}>
        {children}
      </div>
    </div>
  );
}

/** Big playful sport medallion with the crest-style watermark. */
function SportSplash({ sportKey, name, size = 56 }: { sportKey: string; name: string; size?: number }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className="grid shrink-0 place-items-center rounded-2xl shadow-e1"
        style={{ height: size, width: size, fontSize: size * 0.52, background: `linear-gradient(145deg, ${SPORT_TINT[sportKey] ?? "#F4EFE3"}, #FFFDF8)` }}
        aria-hidden
      >
        {SPORT_EMOJI[sportKey] ?? "•"}
      </div>
      <div className="min-w-0 text-[17px] font-bold text-ink">{name}</div>
    </div>
  );
}

const summaryLabel = {
  background: "linear-gradient(to bottom, transparent calc(50% - 1px), #F7F2E4 calc(50% - 1px))",
} as const;

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
  const [done, setDone] = useState<boolean[]>(() => STEPS.map(() => isEdit));
  const [stepError, setStepError] = useState<string | null>(null);
  const submitIntent = useRef(false);
  const editStep = (i: number) => {
    setStepError(null);
    setStep(i);
  };

  const [firstName, setFirstName] = useState(initial.firstName);
  const [lastName, setLastName] = useState(initial.lastName);
  const [zip, setZip] = useState(initial.zip);
  const [dob, setDob] = useState(initial.dob);
  const [gender, setGender] = useState(initial.gender);
  const [hue, setHue] = useState(initial.hue);
  const [bio, setBio] = useState(initial.bio);
  const [style, setStyle] = useState(initial.playStyle || "both");
  const [ranges, setRanges] = useState<Range[]>(initial.availability);
  const [addingDay, setAddingDay] = useState<string | null>(null);
  const [draftStart, setDraftStart] = useState("18:00");
  const [draftEnd, setDraftEnd] = useState("21:00");

  const [picked, setPicked] = useState<Picked>(
    Object.fromEntries(
      initial.sports.map((s) => [s.key, { level: s.level, primary: s.primary, rating: s.rating, format: s.format || "both", hand: s.hand || "" }]),
    ),
  );

  // ── the add-a-sport flow ──────────────────────────────────────────────
  const [configuring, setConfiguring] = useState<string | null>(null);
  const [draft, setDraft] = useState<SportConfig>({ level: "casual", primary: false, rating: "", format: "both", hand: "" });
  const openConfig = (key: string) => {
    setStepError(null);
    const fixed = sportFormatFixed(key);
    const base = picked[key] ? { ...picked[key] } : { level: "casual", primary: false, rating: "", format: fixed ?? (key === "beach_volleyball" ? "any" : "both"), hand: "" };
    if (fixed) base.format = fixed;
    setDraft(base);
    setConfiguring(key);
  };
  const commitConfig = () => {
    if (!configuring) return;
    const r = draft.rating.trim();
    if (r && !/^\d{1,2}(\.\d)?$/.test(r)) {
      setStepError("Ratings look like 3.5 or 18 — or leave it blank.");
      return;
    }
    setStepError(null);
    setPicked((p) => {
      const isFirst = Object.keys(p).length === 0 && !p[configuring];
      return { ...p, [configuring]: { ...draft, rating: r, primary: p[configuring]?.primary ?? (isFirst || draft.primary) } };
    });
    setConfiguring(null);
  };
  const removeSport = (key: string) => {
    setPicked((p) => {
      const next = { ...p };
      const wasPrimary = next[key]?.primary;
      delete next[key];
      const rest = Object.keys(next);
      if (wasPrimary && rest.length) next[rest[0]] = { ...next[rest[0]], primary: true };
      return next;
    });
    if (configuring === key) setConfiguring(null);
  };
  const setPrimary = (key: string) =>
    setPicked((p) => Object.fromEntries(Object.entries(p).map(([k, v]) => [k, { ...v, primary: k === key }])));

  const pickedKeys = Object.keys(picked);
  const sportName = (k: string) => sports.find((s) => s.key === k)?.name ?? k;
  const skillSys = (k: string) => sports.find((s) => s.key === k)?.skill_system ?? "Rating";
  const initials = useMemo(() => `${(firstName.trim()[0] ?? "")}${(lastName.trim()[0] ?? "")}`.toUpperCase() || "Y", [firstName, lastName]);

  // ── profile photo (the shared cropper flow) ───────────────────────────
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

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
      if (configuring) return setStepError(`Finish adding ${sportName(configuring)} — or cancel it — before continuing.`);
      if (pickedKeys.length === 0) return setStepError("Add at least one sport to your lineup.");
    }
    setStepError(null);
    setDone((d) => {
      const n = [...d];
      n[step] = true;
      return n;
    });
    setStep((s) => {
      for (let i = s + 1; i < STEPS.length - 1; i++) {
        if (!done[i]) return i;
      }
      return STEPS.length - 1;
    });
  }
  function back() {
    setStepError(null);
    setStep((s) => Math.max(s - 1, 0));
  }

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

  const configMeta = configuring ? sports.find((s) => s.key === configuring) : null;

  /* ---- the journey rail: every step, in order, done cards outside ---- */
  const summaryFor = (i: number) => {
    if (i === 0)
      return (
        <div className="flex items-center gap-3">
          <span
            aria-hidden
            className="grid h-11 w-11 shrink-0 place-items-center overflow-hidden rounded-full font-display text-base text-surface"
            style={avatarUrl ? undefined : { background: `linear-gradient(145deg, hsl(${hue},85%,62%) 0%, hsl(${(hue + 22) % 360},80%,48%) 100%)` }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {avatarUrl ? <img src={avatarUrl} alt="" className="h-full w-full object-cover" /> : initials}
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-bold text-ink">{firstName} {lastName}</p>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <span className="rounded-lg border border-[#E0D5BB] bg-surface/70 px-2 py-0.5 font-mono text-[11.5px] font-bold text-ink-soft">ZIP {zip}</span>
              {dob ? (
                <span className="rounded-lg border border-[#E0D5BB] bg-surface/70 px-2 py-0.5 text-[11.5px] font-semibold text-ink-soft">
                  Born {new Date(dob + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                </span>
              ) : null}
              {gender ? <span className="rounded-lg border border-[#E0D5BB] bg-surface/70 px-2 py-0.5 text-[11.5px] font-semibold capitalize text-ink-soft">{gender.replace(/_/g, " ")}</span> : null}
            </div>
          </div>
        </div>
      );
    if (i === 1)
      return (
        <div className="space-y-1.5">
          {pickedKeys.map((k) => (
            <p key={k} className="flex items-center gap-2 text-[14.5px] text-ink">
              <span aria-hidden className="text-[17px]">{SPORT_EMOJI[k] ?? "•"}</span>
              <span className="font-bold">{sportName(k)}</span>
              <span className="min-w-0 truncate text-[13px] text-mute">
                {LEVELS.find((l) => l.key === picked[k].level)?.label} · {playFormatLabel(k, picked[k].format)}
                {picked[k].rating ? ` · ${skillSys(k)} ${picked[k].rating}` : ""}
              </span>
              {picked[k].primary ? <Star size={12} fill="currentColor" className="shrink-0 text-brand-deep" aria-hidden /> : null}
            </p>
          ))}
        </div>
      );
    if (i === 2)
      return ranges.length ? (
        <div className="flex flex-wrap gap-1.5">
          {ranges.map((r, idx) => (
            <span key={idx} className="rounded-lg border border-rule bg-surface px-2 py-1 font-mono text-[12px] font-semibold text-ink">
              {r.day} {r.start}–{r.end}
            </span>
          ))}
        </div>
      ) : (
        <p className="text-[14.5px] text-mute">Flexible — no set windows.</p>
      );
    if (i === 3)
      return (
        <p className="text-[14.5px] text-ink-soft">{bio.trim() ? bio.slice(0, 110) : <span className="text-mute">No bio yet — that&rsquo;s fine.</span>}</p>
      );
    return null;
  };

  return (
    <form action={formAction} onSubmit={onSubmit} className="grid gap-10 lg:grid-cols-[minmax(280px,336px)_minmax(0,1fr)] lg:items-start lg:gap-10">
      {/* ════ the journey rail ════ */}
      <aside className="lg:sticky lg:top-24">
        <p className="kicker text-brand-deep">{isEdit ? "Your profile" : "Almost in"}</p>
        <h1 className="mt-2 font-display text-4xl text-ink sm:text-5xl">
          {isEdit ? <>Edit your <span className="italic">profile.</span></> : <>Build your <span className="italic">profile.</span></>}
        </h1>
        <p className="mt-3 max-w-sm text-[15px] leading-relaxed text-mute">
          {isEdit
            ? "Everything here can change as your game does — update a rating, add a sport, reset your times."
            : "Five quick steps and your spot on the board is reserved. It all stays editable later."}
        </p>

        <ol className="mt-7 space-y-3">
          {STEPS.map((title, i) => {
            const isReview = i === STEPS.length - 1;
            if (i === step) {
              return (
                <li key={title} className="relative rounded-2xl border border-brand/35 bg-surface px-4 py-3 shadow-e1">
                  <span aria-hidden className="absolute left-0 top-1/2 h-6 w-[3px] -translate-y-1/2 rounded-full" style={{ background: "linear-gradient(180deg,#FF7A4D,#D63A0F)" }} />
                  <p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-brand-deep">Step {i + 1} · now</p>
                  <p className="text-[16px] font-bold text-ink">{title}</p>
                </li>
              );
            }
            if (done[i] && !isReview) {
              return (
                <li key={title} className="wiz-sum relative rounded-2xl border border-[#E4DAC2] bg-[#F7F2E4] px-4 pb-3.5 pt-4">
                  <span className="absolute -top-[8px] left-3 inline-flex h-[16px] items-center px-1.5 font-mono text-[10px] font-bold uppercase tracking-[.16em] text-faint" style={summaryLabel}>
                    0{i + 1} · {title}
                  </span>
                  <button
                    type="button"
                    onClick={() => editStep(i)}
                    className="press absolute -top-3 right-3 inline-flex items-center gap-1 rounded-full border border-rule-2 bg-surface px-2.5 py-1 text-[12px] font-bold text-ink shadow-e1"
                  >
                    <Pencil size={11} /> Edit
                  </button>
                  {summaryFor(i)}
                </li>
              );
            }
            return (
              <li key={title} className="flex items-center gap-3 rounded-2xl border border-dashed border-rule px-4 py-3">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full border border-rule font-mono text-[11px] font-bold text-faint">{i + 1}</span>
                <span className="text-[15px] font-semibold text-faint">{title}</span>
              </li>
            );
          })}
        </ol>

        <ul className="mt-7 hidden space-y-2.5 lg:block">
          {["Takes about two minutes", "Each sport gets its own ranking", "Nothing here is locked in"].map((t) => (
            <li key={t} className="flex items-center gap-2.5 text-[14px] text-ink-soft">
              <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
              {t}
            </li>
          ))}
        </ul>
      </aside>

      {/* ════ the work card: only the active step ════ */}
      <div className="min-w-0">
        <div className="rounded-3xl border border-rule bg-surface p-6 shadow-[0_1px_0_rgba(10,10,11,0.02)] sm:p-8">
          <div className="flex items-baseline justify-between">
            <span className="kicker text-brand-deep">Step {step + 1} of {STEPS.length}</span>
            <span className="kicker text-faint">{STEPS[step]}</span>
          </div>
          <div className="mt-2 h-1 overflow-hidden rounded-full bg-rule">
            <div className="h-full rounded-full transition-all duration-300" style={{ width: `${((step + 1) / STEPS.length) * 100}%`, background: "linear-gradient(90deg, #FF7A4D, #D63A0F)" }} />
          </div>

          <div key={step} className="wiz-card mt-6">
            <div className="mb-6">
              <h2 className="text-2xl font-bold tracking-[-0.01em] text-ink sm:text-[28px]">{HEADS[step].h}</h2>
              <p className="mt-1 text-[15px] text-mute">{HEADS[step].sub}</p>
            </div>

            {/* ---- 1 · about you (+ photo + color) ---- */}
            {step === 0 ? (
              <div className="space-y-5">
                <div className="flex flex-wrap items-center gap-5 rounded-2xl border border-rule bg-bg/50 p-4">
                  <AvatarUploader initialPhotoUrl={avatarUrl} hue={hue} name={`${firstName} ${lastName}`.trim() || "You"} size={76} onUploaded={setAvatarUrl} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-bold text-ink">Profile photo</p>
                    <p className="text-[13.5px] text-mute">A face gets more matches than a color — but the color works too.</p>
                    <div className="mt-2.5 flex gap-1.5">
                      {HUES.map((h) => (
                        <button
                          key={h}
                          type="button"
                          aria-label={`Color ${h}`}
                          onClick={() => setHue(h)}
                          className={"h-6 w-6 rounded-full transition-transform " + (hue === h ? "scale-110 ring-2 ring-ink ring-offset-2 ring-offset-surface" : "hover:scale-105")}
                          style={{ background: `linear-gradient(145deg, hsl(${h},85%,62%) 0%, hsl(${(h + 22) % 360},80%,48%) 100%)` }}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-[13px] font-bold uppercase tracking-[.08em] text-faint">First name</span>
                    <input value={firstName} onChange={(e) => setFirstName(e.target.value.slice(0, 40))} autoComplete="given-name" className="mt-1.5 w-full rounded-xl border border-rule-2 bg-surface px-3.5 py-3 text-[16px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/15" />
                  </label>
                  <label className="block">
                    <span className="text-[13px] font-bold uppercase tracking-[.08em] text-faint">Last name</span>
                    <input value={lastName} onChange={(e) => setLastName(e.target.value.slice(0, 40))} autoComplete="family-name" className="mt-1.5 w-full rounded-xl border border-rule-2 bg-surface px-3.5 py-3 text-[16px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/15" />
                  </label>
                </div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-[13px] font-bold uppercase tracking-[.08em] text-faint">Home ZIP</span>
                    <input value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, "").slice(0, 5))} inputMode="numeric" placeholder="90066" className="mt-1.5 w-full rounded-xl border border-rule-2 bg-surface px-3.5 py-3 font-mono text-[16px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/15" />
                  </label>
                  <label className="block">
                    <span className="text-[13px] font-bold uppercase tracking-[.08em] text-faint">Date of birth</span>
                    <input type="date" value={dob} onChange={(e) => setDob(e.target.value)} className="mt-1.5 w-full rounded-xl border border-rule-2 bg-surface px-3.5 py-3 text-[16px] text-ink outline-none transition-colors focus:border-brand focus:ring-4 focus:ring-brand/15" />
                  </label>
                </div>
                <p className="text-[13px] leading-relaxed text-mute">Klimr is 18+. Your birthday is used for verification and never shown on your profile.</p>
              </div>
            ) : null}

            {/* ---- 2 · your lineup (merged pick + configure, one at a time) ---- */}
            {step === 1 ? (
              <div className="space-y-6">
                {pickedKeys.length ? (
                  <div>
                    <p className="mb-2 text-[13px] font-bold uppercase tracking-[.08em] text-faint">Your lineup</p>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {pickedKeys.map((k) => (
                        <div key={k} className="relative overflow-hidden rounded-[20px] border-2 border-brand/50 p-4 shadow-e1" style={{ background: `linear-gradient(135deg, ${SPORT_TINT[k] ?? "#F6F1E4"}, #FFFDF8 72%)` }}>
                          <span aria-hidden className="pointer-events-none absolute -bottom-4 -right-2 select-none text-[84px] opacity-10" style={{ transform: "rotate(-12deg)" }}>
                            {SPORT_EMOJI[k] ?? "•"}
                          </span>
                          <SportSplash sportKey={k} name={sportName(k)} size={48} />
                          <p className="mt-2 text-[13.5px] font-semibold text-ink-soft">
                            {LEVELS.find((l) => l.key === picked[k].level)?.label} · {playFormatLabel(k, picked[k].format)}
                            {picked[k].hand ? ` · ${HANDS.find((h) => h.value === picked[k].hand)?.label}` : ""}
                            {picked[k].rating ? ` · ${skillSys(k)} ${picked[k].rating}` : ""}
                          </p>
                          <div className="mt-3 flex items-center gap-3">
                            <button type="button" onClick={() => setPrimary(k)} className={"flex items-center gap-1 text-[13px] font-bold transition-colors " + (picked[k].primary ? "text-brand-deep" : "text-faint hover:text-mute")}>
                              <Star size={13} fill={picked[k].primary ? "currentColor" : "none"} aria-hidden />
                              {picked[k].primary ? "Primary" : "Make primary"}
                            </button>
                            <button type="button" onClick={() => openConfig(k)} className="text-[13px] font-bold text-ink-soft transition-colors hover:text-ink">Edit</button>
                            <button type="button" onClick={() => removeSport(k)} aria-label={`Remove ${sportName(k)}`} className="press ml-auto grid h-7 w-7 place-items-center rounded-full text-mute transition-colors hover:bg-white/70 hover:text-brand-deep">
                              <X size={15} strokeWidth={2.5} />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ) : null}

                {configuring && configMeta ? (
                  <div className="wiz-card relative overflow-hidden rounded-[22px] border-2 border-rule-2 p-5" style={{ background: `linear-gradient(150deg, ${SPORT_TINT[configuring] ?? "#F6F1E4"}, #FFFDF8 60%)` }}>
                    <span aria-hidden className="pointer-events-none absolute -bottom-8 -right-4 select-none text-[150px] opacity-[0.08]" style={{ transform: "rotate(-12deg)" }}>
                      {SPORT_EMOJI[configuring] ?? "•"}
                    </span>
                    <div className="relative">
                      <SportSplash sportKey={configuring} name={configMeta.name} size={56} />
                      <div className="mt-5 grid gap-5 lg:grid-cols-2">
                        <OptionGroup label="Experience">
                          {LEVELS.map((l) => (
                            <OptionRow key={l.key} active={draft.level === l.key} label={l.label} blurb={l.blurb} onPick={() => setDraft((d) => ({ ...d, level: l.key }))} />
                          ))}
                        </OptionGroup>
                        <div className="space-y-5">
                          {sportFormatFixed(configuring) ? (
                            <div>
                              <p className="mb-1.5 text-[13px] font-bold uppercase tracking-[.08em] text-faint">Format</p>
                              <p className="rounded-2xl border border-rule bg-surface px-3.5 py-3 text-[15px] font-semibold text-ink-soft">
                                Doubles — padel is a doubles game, so this one&rsquo;s locked in. 🎾
                              </p>
                            </div>
                          ) : (
                            <OptionGroup label={configuring === "beach_volleyball" ? "Team size" : "Format"}>
                              {sportFormats(configuring).map((f) => (
                                <OptionRow key={f.value} active={draft.format === f.value} label={f.label} blurb={f.blurb} onPick={() => setDraft((d) => ({ ...d, format: f.value }))} />
                              ))}
                            </OptionGroup>
                          )}
                          <OptionGroup label={sportHandLabel(configuring)} optional>
                            {HANDS.map((h) => (
                              <OptionRow key={h.value || "none"} active={draft.hand === h.value} label={h.label} blurb={h.blurb || undefined} onPick={() => setDraft((d) => ({ ...d, hand: h.value }))} />
                            ))}
                          </OptionGroup>
                        </div>
                      </div>
                      <div className="mt-5 flex flex-wrap items-end gap-4">
                        <label className="block">
                          <span className="text-[13px] font-bold uppercase tracking-[.08em] text-faint">{configMeta.skill_system ?? "Rating"} <span className="font-semibold normal-case tracking-normal text-faint/80">· optional</span></span>
                          <input
                            value={draft.rating}
                            onChange={(e) => setDraft((d) => ({ ...d, rating: e.target.value.replace(/[^\d.]/g, "").slice(0, 4) }))}
                            inputMode="decimal"
                            placeholder={RATING_HINT[configMeta.skill_system ?? ""] ?? "e.g. 4.0"}
                            className="mt-1.5 w-28 rounded-xl border border-rule-2 bg-surface px-3 py-2.5 font-mono text-[16px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/15"
                          />
                        </label>
                        <button type="button" onClick={commitConfig} className="press inline-flex items-center gap-1.5 rounded-xl px-5 py-3 text-[15px] font-bold text-white shadow-flame transition-[filter] hover:brightness-[1.06]" style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}>
                          <Check size={16} strokeWidth={3} /> {picked[configuring] ? `Save ${configMeta.name}` : `Add ${configMeta.name} to my lineup`}
                        </button>
                        <button type="button" onClick={() => setConfiguring(null)} className="press py-3 text-[14px] font-semibold text-mute transition-colors hover:text-ink">
                          Cancel
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div>
                    <p className="mb-2 text-[13px] font-bold uppercase tracking-[.08em] text-faint">{pickedKeys.length ? "Add another sport" : "Pick a sport to start"}</p>
                    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                      {sports.filter((s) => !picked[s.key]).map((s) => (
                        <button
                          key={s.key}
                          type="button"
                          onClick={() => openConfig(s.key)}
                          className="lift relative overflow-hidden rounded-[20px] border-2 border-rule bg-surface p-4 text-left transition-all hover:border-brand/50"
                        >
                          <span aria-hidden className="pointer-events-none absolute -bottom-4 -right-2 select-none text-[76px] opacity-10 transition-transform duration-300 group-hover:scale-110" style={{ transform: "rotate(-12deg)" }}>
                            {SPORT_EMOJI[s.key] ?? "•"}
                          </span>
                          <div className="grid h-14 w-14 place-items-center rounded-2xl text-[30px] shadow-e1" style={{ background: `linear-gradient(145deg, ${SPORT_TINT[s.key] ?? "#F4EFE3"}, #FFFDF8)` }} aria-hidden>
                            {SPORT_EMOJI[s.key] ?? "•"}
                          </div>
                          <p className="mt-2.5 text-[16px] font-bold text-ink">{s.name}</p>
                          <p className="mt-0.5 inline-flex items-center gap-1 text-[13px] font-semibold text-brand-deep"><Plus size={13} strokeWidth={3} /> Add</p>
                        </button>
                      ))}
                      {sports.every((s) => picked[s.key]) ? (
                        <p className="col-span-full rounded-2xl border border-dashed border-rule px-4 py-5 text-center text-[14px] text-mute">That&rsquo;s every sport on Klimr — full lineup. 🏆</p>
                      ) : null}
                    </div>
                  </div>
                )}

                <OptionGroup label="Match style">
                  {STYLES.map((s) => (
                    <OptionRow key={s.value} active={style === s.value} label={s.label} blurb={s.blurb} onPick={() => setStyle(s.value)} />
                  ))}
                </OptionGroup>
              </div>
            ) : null}

            {/* ---- 3 · schedule (15-minute blocks per day) ---- */}
            {step === 2 ? (
              <div className="space-y-4">
                <div className="overflow-hidden rounded-2xl border border-rule bg-surface shadow-e1">
                  <div className="divide-y divide-rule">
                    {DAYS.map((d) => {
                      const dayRanges = ranges.map((r, i) => ({ ...r, i })).filter((r) => r.day === d.key);
                      const adding = addingDay === d.key;
                      const invalid = toMin(draftStart) >= toMin(draftEnd);
                      return (
                        <div key={d.key} className="px-3 py-3 sm:px-4">
                          <div className="flex items-start gap-3">
                            <span className="mt-1.5 w-10 shrink-0 font-mono text-[13px] font-bold text-ink-soft">{d.label}</span>
                            <div className="flex flex-1 flex-wrap items-center gap-1.5">
                              {dayRanges.length === 0 && !adding ? <span className="text-[13.5px] text-faint">Not available</span> : null}
                              {dayRanges.map((r) => (
                                <span key={r.i} className="inline-flex items-center gap-1 rounded-full border border-rule bg-bg py-1.5 pl-3 pr-1.5 text-[13.5px] font-semibold text-ink">
                                  {timeLabel(r.start)} – {timeLabel(r.end)}
                                  <button type="button" onClick={() => removeRange(r.i)} aria-label={`Remove ${d.label} ${timeLabel(r.start)} to ${timeLabel(r.end)}`} className="press grid h-5 w-5 place-items-center rounded-full text-mute transition-colors hover:bg-rule hover:text-brand-deep">
                                    <X size={12} strokeWidth={2.5} aria-hidden />
                                  </button>
                                </span>
                              ))}
                              {!adding ? (
                                <button type="button" onClick={() => openAdder(d.key)} className="press inline-flex items-center gap-1 rounded-full border border-dashed border-rule px-3 py-1.5 text-[13.5px] font-semibold text-mute transition-colors hover:border-ink hover:text-ink">
                                  <Plus size={13} strokeWidth={2.5} aria-hidden /> Add time
                                </button>
                              ) : null}
                            </div>
                          </div>
                          {adding ? (
                            <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-[52px]">
                              <select value={draftStart} onChange={(e) => setDraftStart(e.target.value)} aria-label="Start time" className="rounded-[10px] border border-rule-2 bg-surface px-2.5 py-2 text-[14px] text-ink outline-none transition-colors focus:border-brand focus:ring-4 focus:ring-brand/15">
                                {TIME_OPTS.map((t) => (
                                  <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                              </select>
                              <span className="text-[14px] text-mute">to</span>
                              <select value={draftEnd} onChange={(e) => setDraftEnd(e.target.value)} aria-label="End time" className="rounded-[10px] border border-rule-2 bg-surface px-2.5 py-2 text-[14px] text-ink outline-none transition-colors focus:border-brand focus:ring-4 focus:ring-brand/15">
                                {TIME_OPTS.map((t) => (
                                  <option key={t.value} value={t.value}>{t.label}</option>
                                ))}
                              </select>
                              <button type="button" onClick={() => addRange(d.key)} disabled={invalid} className="press rounded-lg bg-ink px-3.5 py-2 text-[14px] font-bold text-surface transition-colors hover:bg-ink-soft disabled:opacity-40">Add</button>
                              <button type="button" onClick={() => setAddingDay(null)} className="press text-[14px] text-mute transition-colors hover:text-ink">Cancel</button>
                              {invalid ? <span className="w-full text-[12.5px] text-brand-deep">End time must be after the start.</span> : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button type="button" onClick={() => setRanges(DAYS.slice(0, 5).map((d) => ({ day: d.key, start: "18:00", end: "21:00" })))} className="press rounded-full border border-rule bg-surface px-3.5 py-2 text-[13.5px] font-semibold text-ink-soft transition-colors hover:border-ink">Weekday evenings</button>
                  <button type="button" onClick={() => setRanges(["sat", "sun"].map((d) => ({ day: d, start: "09:00", end: "12:00" })))} className="press rounded-full border border-rule bg-surface px-3.5 py-2 text-[13.5px] font-semibold text-ink-soft transition-colors hover:border-ink">Weekend mornings</button>
                  <button type="button" onClick={() => { setRanges([]); setAddingDay(null); }} className="press rounded-full border border-rule bg-surface px-3.5 py-2 text-[13.5px] font-semibold text-mute transition-colors hover:border-ink">Clear</button>
                </div>
                <p className="text-[13.5px] text-mute">Add the times you&rsquo;re usually free, in 15-minute steps — as many blocks per day as you like. Change them anytime.</p>
              </div>
            ) : null}

            {/* ---- 4 · finishing touches ---- */}
            {step === 3 ? (
              <div className="space-y-5">
                <label className="block">
                  <span className="text-[13px] font-bold uppercase tracking-[.08em] text-faint">Bio <span className="font-semibold normal-case tracking-normal text-faint/80">· optional</span></span>
                  <textarea value={bio} onChange={(e) => setBio(e.target.value.slice(0, 160))} rows={3} placeholder="Weekend pickleball, always up for a rally." className="mt-1.5 w-full resize-none rounded-xl border border-rule-2 bg-surface px-3.5 py-3 text-[16px] text-ink outline-none transition-colors placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/15" />
                  <span className="mt-1 block text-right font-mono text-[11px] text-faint">{bio.length}/160</span>
                </label>
                <label className="block">
                  <span className="text-[13px] font-bold uppercase tracking-[.08em] text-faint">Gender <span className="font-semibold normal-case tracking-normal text-faint/80">· optional</span></span>
                  <select value={gender} onChange={(e) => setGender(e.target.value)} className="mt-1.5 w-full rounded-xl border border-rule-2 bg-surface px-3.5 py-3 text-[16px] text-ink outline-none transition-colors focus:border-brand focus:ring-4 focus:ring-brand/15">
                    <option value="">Prefer not to say</option>
                    <option value="woman">Woman</option>
                    <option value="man">Man</option>
                    <option value="nonbinary">Non-binary</option>
                  </select>
                </label>
                <p className="text-[13.5px] leading-relaxed text-mute">Gender is used only for optional match filters and is never shown without your say.</p>
              </div>
            ) : null}

            {/* ---- 5 · review ---- */}
            {step === 4 ? (
              <div className="rounded-2xl border border-dashed border-rule-2 bg-bg px-5 py-7 text-center">
                <p className="text-[16px] font-bold text-ink">Your whole profile is in the rail — every card, exactly as it will save.</p>
                <p className="mt-1.5 text-[14px] text-mute">Tap <span className="font-bold">Edit</span> on any card to change it, then make it official below.</p>
              </div>
            ) : null}

            <div aria-live="polite">
              {stepError || state.error ? (
                <p role="alert" className="mt-4 rounded-xl border border-[#f0c2b0] bg-[#fbeee7] px-3.5 py-2.5 text-[14px] font-semibold text-brand-deep">
                  {stepError ?? state.error}
                </p>
              ) : null}
            </div>

            {/* nav */}
            <div className="mt-6 flex items-center gap-3">
              {step > 0 ? (
                <button type="button" onClick={back} className="press rounded-xl border border-rule bg-surface px-5 py-3 text-[15px] font-semibold text-ink shadow-e1 transition-colors hover:border-ink">Back</button>
              ) : null}
              {step < STEPS.length - 1 ? (
                <button key="continue" type="button" onClick={next} className="press flex-1 rounded-xl bg-ink px-4 py-3 text-[16px] font-bold text-surface transition-colors hover:bg-ink-soft">Continue</button>
              ) : (
                <button
                  key="finish"
                  type="submit"
                  disabled={pending}
                  onClick={() => { submitIntent.current = true; }}
                  className="press flex-1 rounded-xl px-4 py-3 text-[16px] font-bold text-white shadow-flame transition-[filter] hover:brightness-[1.06] disabled:opacity-60"
                  style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}
                >
                  {pending ? "Saving…" : isEdit ? "Save profile" : "Finish profile"}
                </button>
              )}
            </div>
          </div>
        </div>

        <p className="mt-4 flex items-start gap-2 rounded-xl border border-rule-soft bg-bg px-3.5 py-2.5 text-[12.5px] leading-relaxed text-mute">
          <ShieldCheck size={14} className="mt-0.5 shrink-0 text-ink-soft" aria-hidden />
          <span>
            <span className="font-semibold text-ink-soft">Your privacy:</span> Klimr does not sell or share your personal information. The details you provide are used solely to operate your Klimr profile and connect you with players, as described in our{" "}
            <Link href="/legal#privacy" target="_blank" className="font-semibold text-ink underline decoration-rule-2 underline-offset-2 hover:text-brand-deep">Privacy Policy</Link>.
          </span>
        </p>

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
      </div>
    </form>
  );
}
