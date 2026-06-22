"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Loader2, Globe, Rocket, MapPin } from "lucide-react";
import { Toggle, Segmented, OptionCards } from "@/components/form-kit";
import { SPORTS, sportMeta } from "@/lib/sports";
import { FORMAT_LABEL, isoToLocalInput, localInputToIso, type FormatType, type TournamentDraftPatch } from "@/lib/tournament";
import { updateTournamentDraft, publishTournament, unpublishTournament } from "@/app/tournaments/actions";
import { resolveTeamZip } from "@/app/teams/actions";

type Init = {
  id: string;
  code: string;
  status: string;
  title: string;
  summary: string;
  description: string;
  sport_key: string;
  entry_type: "individual" | "team";
  visibility: "public" | "unlisted";
  starts_at: string | null;
  ends_at: string | null;
  timezone: string | null;
  location_name: string | null;
  location_address: string | null;
  weather_enabled: boolean;
  capacity: number | null;
  reserves_allowed: number;
  min_women: number;
  min_men: number;
  registration_opens_at: string | null;
  registration_deadline: string | null;
  format_type: FormatType;
  pool_count: number;
  roster_size: number;
  waiver_text: string;
  rules_text: string;
  require_waiver: boolean;
  require_rules: boolean;
};

const STEPS = ["Basics", "When & where", "Format", "Registration", "Legal", "Review"];
const LAST = STEPS.length - 1;

const inputCls = "w-full rounded-xl border border-rule bg-bg px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-brand";
const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-mute";
const hintCls = "mt-1.5 text-xs text-mute";

export function TournamentSetupWizard({ init, startStep }: { init: Init; startStep?: number }) {
  const router = useRouter();
  const [step, setStep] = useState(Math.min(Math.max(startStep ?? 0, 0), LAST));
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [status, setStatus] = useState(init.status);

  const [title, setTitle] = useState(init.title);
  const [summary, setSummary] = useState(init.summary);
  const [description, setDescription] = useState(init.description);
  const [sport, setSport] = useState(init.sport_key);
  const [entry, setEntry] = useState<"individual" | "team">(init.entry_type);
  const [visibility, setVisibility] = useState<"public" | "unlisted">(init.visibility);
  const [startsAt, setStartsAt] = useState(isoToLocalInput(init.starts_at));
  const [endsAt, setEndsAt] = useState(isoToLocalInput(init.ends_at));
  const [tz, setTz] = useState(init.timezone ?? "");
  const [locName, setLocName] = useState(init.location_name ?? "");
  const [locAddr, setLocAddr] = useState(init.location_address ?? "");
  const [locZip, setLocZip] = useState("");
  const [locResolved, setLocResolved] = useState<{ city: string; state: string } | null>(null);
  const [, startZip] = useTransition();
  const onLocZip = (v: string) => {
    const z = v.replace(/\D/g, "").slice(0, 5);
    setLocZip(z);
    setLocResolved(null);
    if (z.length === 5) startZip(async () => setLocResolved(await resolveTeamZip(z)));
  };
  const [weather, setWeather] = useState(init.weather_enabled);
  const [formatType, setFormatType] = useState<FormatType>(init.format_type);
  const [poolCount, setPoolCount] = useState(String(init.pool_count || 2));
  const [rosterSize, setRosterSize] = useState(String(init.roster_size || 2));
  const [capacity, setCapacity] = useState(init.capacity != null ? String(init.capacity) : "");
  const [reserves, setReserves] = useState(String(init.reserves_allowed ?? 0));
  const [genderRule, setGenderRule] = useState<"open" | "min_women" | "min_men">(
    init.min_women > 0 ? "min_women" : init.min_men > 0 ? "min_men" : "open",
  );
  const [minCount, setMinCount] = useState(String(init.min_women > 0 ? init.min_women : init.min_men > 0 ? init.min_men : 1));
  const [regOpens, setRegOpens] = useState(isoToLocalInput(init.registration_opens_at));
  const [regDeadline, setRegDeadline] = useState(isoToLocalInput(init.registration_deadline));
  const [waiver, setWaiver] = useState(init.waiver_text);
  const [rules, setRules] = useState(init.rules_text);
  const [reqWaiver, setReqWaiver] = useState(init.require_waiver);
  const [reqRules, setReqRules] = useState(init.require_rules);

  const reserveMax = sport === "beach_volleyball" ? 2 : 4;

  function buildPatch(): TournamentDraftPatch {
    const n = (v: string) => Math.max(parseInt(v || "0", 10) || 0, 0);
    return {
      title: title.trim(),
      summary: summary.trim() || null,
      description: description.trim() || null,
      sport_key: sport,
      entry_type: entry,
      visibility,
      starts_at: localInputToIso(startsAt),
      ends_at: localInputToIso(endsAt),
      timezone: tz.trim() || null,
      location_name: locName.trim() || null,
      location_address: locAddr.trim() || null,
      zip: locZip.trim() || undefined,
      weather_enabled: weather,
      capacity: capacity.trim() === "" ? null : n(capacity),
      reserves_allowed: Math.min(n(reserves), reserveMax),
      min_women: genderRule === "min_women" ? n(minCount) : 0,
      min_men: genderRule === "min_men" ? n(minCount) : 0,
      registration_opens_at: localInputToIso(regOpens),
      registration_deadline: localInputToIso(regDeadline),
      format_config: {
        format_type: formatType,
        pool_count: n(poolCount) || 2,
        roster_size: n(rosterSize) || 2,
        legal: { waiver_text: waiver.trim(), rules_text: rules.trim(), require_waiver: reqWaiver, require_rules: reqRules },
      },
    };
  }

  async function persist(): Promise<boolean> {
    setSaving(true);
    setErr(null);
    try {
      const res = await updateTournamentDraft(init.id, buildPatch());
      if (res.ok) {
        setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
        return true;
      }
      setErr(res.error ?? "Couldn't save. Try again.");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function go(to: number) {
    if (await persist()) {
      setStep(Math.min(Math.max(to, 0), LAST));
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }

  async function onPublish() {
    if (!(await persist())) return;
    setSaving(true);
    try {
      const res = await publishTournament(init.id);
      if (res.ok) {
        setStatus("published");
        router.refresh();
      } else {
        setErr(res.error ?? "Couldn't publish.");
      }
    } finally {
      setSaving(false);
    }
  }

  async function onUnpublish() {
    setSaving(true);
    try {
      const res = await unpublishTournament(init.id);
      if (res.ok) {
        setStatus("draft");
        router.refresh();
      } else {
        setErr(res.error ?? "Couldn't update.");
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="md:flex md:gap-8">
      {/* step rail */}
      <div className="md:w-60 md:shrink-0">
        {/* mobile progress */}
        <div className="mb-5 md:hidden">
          <div className="flex items-center justify-between text-xs font-semibold text-mute">
            <span>
              Step {step + 1} of {STEPS.length}
            </span>
            <span className="text-ink">{STEPS[step]}</span>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-rule">
            <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>
        </div>
        {/* desktop stepper */}
        <nav className="sticky top-6 hidden flex-col gap-1 md:flex" aria-label="Setup steps">
          {STEPS.map((label, i) => {
            const done = i < step;
            const current = i === step;
            return (
              <button
                key={label}
                type="button"
                onClick={() => go(i)}
                aria-current={current ? "step" : undefined}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${current ? "bg-tint-brand" : "hover:bg-bg"}`}
              >
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${done ? "bg-success text-white" : current ? "bg-brand text-white" : "bg-[#f4f4f5] text-mute"}`}>
                  {done ? <Check size={14} /> : i + 1}
                </span>
                <span className={`text-sm font-semibold ${current ? "text-brand-deep" : done ? "text-ink" : "text-mute"}`}>{label}</span>
              </button>
            );
          })}
        </nav>
      </div>

      {/* step content */}
      <div className="min-w-0 flex-1">
        <div className="rounded-3xl border border-rule bg-surface p-6 sm:p-8">
          {step === 0 ? (
            <div>
              <h2 className="font-display text-2xl text-ink">Basics</h2>
              <p className="mt-1 text-sm text-mute">Name your event and tell players what it is.</p>
              <div className="mt-6 grid gap-5">
                <div>
                  <label className={labelCls}>Tournament name</label>
                  <input className={inputCls} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Summer Beach Classic" />
                </div>
                <div>
                  <label className={labelCls}>Tagline</label>
                  <input className={inputCls} value={summary} onChange={(e) => setSummary(e.target.value)} maxLength={160} placeholder="One line shown on the public page" />
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Sport</label>
                    <select className={inputCls} value={sport} onChange={(e) => setSport(e.target.value)}>
                      {SPORTS.map((s) => (
                        <option key={s.key} value={s.key}>
                          {s.emoji} {s.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className={labelCls}>Entry type</label>
                    <Segmented
                      ariaLabel="Entry type"
                      value={entry}
                      onChange={setEntry}
                      options={[
                        { value: "team", label: "Team" },
                        { value: "individual", label: "Individual" },
                      ]}
                    />
                  </div>
                </div>
                <div>
                  <label className={labelCls}>Visibility</label>
                  <Segmented
                    ariaLabel="Visibility"
                    value={visibility}
                    onChange={setVisibility}
                    options={[
                      { value: "public", label: "Public" },
                      { value: "unlisted", label: "Unlisted" },
                    ]}
                  />
                  <p className={hintCls}>Public events appear in Explore. Unlisted events are reachable only by their link.</p>
                </div>
                <div>
                  <label className={labelCls}>About</label>
                  <textarea className={`${inputCls} min-h-32 resize-y`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Format, what to bring, prizes, schedule overview…" />
                </div>
              </div>
            </div>
          ) : null}

          {step === 1 ? (
            <div>
              <h2 className="font-display text-2xl text-ink">When &amp; where</h2>
              <p className="mt-1 text-sm text-mute">Set the date, time, and location.</p>
              <div className="mt-6 grid gap-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Starts</label>
                    <input type="datetime-local" className={inputCls} value={startsAt} onChange={(e) => setStartsAt(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Ends</label>
                    <input type="datetime-local" className={inputCls} value={endsAt} onChange={(e) => setEndsAt(e.target.value)} />
                  </div>
                </div>
                <div className="sm:max-w-xs">
                  <label className={labelCls}>Time zone</label>
                  <input className={inputCls} value={tz} onChange={(e) => setTz(e.target.value)} placeholder="America/Los_Angeles" />
                </div>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Venue name</label>
                    <input className={inputCls} value={locName} onChange={(e) => setLocName(e.target.value)} placeholder="Will Rogers State Beach" />
                  </div>
                  <div>
                    <label className={labelCls}>Address</label>
                    <input className={inputCls} value={locAddr} onChange={(e) => setLocAddr(e.target.value)} placeholder="Street, city, state" />
                  </div>
                </div>
                <div className="grid gap-5 sm:grid-cols-[10rem_1fr]">
                  <div>
                    <label className={labelCls}>ZIP code</label>
                    <input className={`${inputCls} font-mono tracking-wider`} value={locZip} onChange={(e) => onLocZip(e.target.value)} inputMode="numeric" placeholder="90066" />
                  </div>
                  <div className="flex items-end">
                    <p className={`${hintCls} flex items-center gap-1.5`}>
                      <MapPin size={13} className="shrink-0 text-faint" />
                      {locResolved ? (
                        <>Places this event near <span className="font-semibold text-ink">{locResolved.city}, {locResolved.state}</span> so players find it in local listings.</>
                      ) : init.location_name || init.location_address ? (
                        <>Set a ZIP to (re)place this event for local discovery. Leave blank to keep the current location.</>
                      ) : (
                        <>Set the event ZIP so it appears in players&rsquo; local tournament listings.</>
                      )}
                    </p>
                  </div>
                </div>
                <Toggle checked={weather} onChange={setWeather} label="Show a weather forecast" description="Display the venue's forecast on the public page, powered by Open-Meteo." />
              </div>
            </div>
          ) : null}

          {step === 2 ? (
            <div>
              <h2 className="font-display text-2xl text-ink">Format</h2>
              <p className="mt-1 text-sm text-mute">How the competition runs and who can enter.</p>
              <div className="mt-6 grid gap-5">
                <div>
                  <label className={labelCls}>Competition format</label>
                  <OptionCards
                    ariaLabel="Competition format"
                    value={formatType}
                    onChange={setFormatType}
                    options={[
                      { value: "pools_knockout", label: "Pools + knockout", hint: "Round-robin pools seed a single-elimination bracket." },
                      { value: "round_robin", label: "Round robin", hint: "Everyone plays everyone; standings by record." },
                      { value: "single_elim", label: "Single elimination", hint: "One bracket, lose and you're out." },
                    ]}
                  />
                </div>
                {formatType === "pools_knockout" ? (
                  <div className="sm:max-w-xs">
                    <label className={labelCls}>Number of pools</label>
                    <input type="number" min={1} className={inputCls} value={poolCount} onChange={(e) => setPoolCount(e.target.value)} />
                  </div>
                ) : null}
                {entry === "team" ? (
                  <div className="sm:max-w-xs">
                    <label className={labelCls}>Players per team (on court)</label>
                    <input type="number" min={1} className={inputCls} value={rosterSize} onChange={(e) => setRosterSize(e.target.value)} />
                    <p className={hintCls}>Each team&rsquo;s main roster must match this exactly to enter.</p>
                  </div>
                ) : null}
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Capacity</label>
                    <input type="number" min={0} className={inputCls} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Leave blank for unlimited" />
                    <p className={hintCls}>Max {entry === "team" ? "teams" : "players"} that can register.</p>
                  </div>
                  {entry === "team" ? (
                    <div>
                      <label className={labelCls}>Reserves per team</label>
                      <input type="number" min={0} max={reserveMax} className={inputCls} value={reserves} onChange={(e) => setReserves(e.target.value)} />
                      <p className={hintCls}>Up to {reserveMax} for {sportMeta(sport).name}.</p>
                    </div>
                  ) : null}
                </div>
                <div>
                  <label className={labelCls}>Gender eligibility</label>
                  <Segmented
                    ariaLabel="Gender eligibility"
                    value={genderRule}
                    onChange={setGenderRule}
                    options={[
                      { value: "open", label: "Open to all" },
                      { value: "min_women", label: "Min. women" },
                      { value: "min_men", label: "Min. men" },
                    ]}
                  />
                  {genderRule !== "open" ? (
                    <div className="mt-3 sm:max-w-xs">
                      <label className={labelCls}>Minimum {genderRule === "min_women" ? "women" : "men"} per entry</label>
                      <input type="number" min={1} className={inputCls} value={minCount} onChange={(e) => setMinCount(e.target.value)} />
                    </div>
                  ) : null}
                  <p className={hintCls}>Counts players who list male or female. Players who prefer not to say can&rsquo;t enter gender-restricted events.</p>
                </div>
              </div>
            </div>
          ) : null}

          {step === 3 ? (
            <div>
              <h2 className="font-display text-2xl text-ink">Registration</h2>
              <p className="mt-1 text-sm text-mute">When sign-ups open and close.</p>
              <div className="mt-6 grid gap-5">
                <div className="grid gap-5 sm:grid-cols-2">
                  <div>
                    <label className={labelCls}>Registration opens</label>
                    <input type="datetime-local" className={inputCls} value={regOpens} onChange={(e) => setRegOpens(e.target.value)} />
                  </div>
                  <div>
                    <label className={labelCls}>Registration deadline</label>
                    <input type="datetime-local" className={inputCls} value={regDeadline} onChange={(e) => setRegDeadline(e.target.value)} />
                  </div>
                </div>
                <div className="rounded-2xl border border-dashed border-rule bg-bg/40 p-4 text-sm text-mute">
                  Entry categories &amp; fees are set in{" "}
                  <Link href={`/tournament/${init.id}/divisions`} className="font-semibold text-brand-deep hover:underline">
                    Divisions
                  </Link>
                  . Custom registration fields and per-member waiver confirmations are coming next.
                </div>
              </div>
            </div>
          ) : null}

          {step === 4 ? (
            <div>
              <h2 className="font-display text-2xl text-ink">Legal</h2>
              <p className="mt-1 text-sm text-mute">Waiver and rules players agree to.</p>
              <div className="mt-6 grid gap-5">
                <div>
                  <label className={labelCls}>Waiver</label>
                  <textarea className={`${inputCls} min-h-32 resize-y`} value={waiver} onChange={(e) => setWaiver(e.target.value)} placeholder="Liability waiver text…" />
                </div>
                <Toggle checked={reqWaiver} onChange={setReqWaiver} label="Require waiver acceptance" description="Each participant must accept the waiver before they're confirmed." />
                <div>
                  <label className={labelCls}>Rules</label>
                  <textarea className={`${inputCls} min-h-32 resize-y`} value={rules} onChange={(e) => setRules(e.target.value)} placeholder="Event rules, format details, conduct…" />
                </div>
                <Toggle checked={reqRules} onChange={setReqRules} label="Require rules acknowledgement" description="Each participant must acknowledge the rules before they're confirmed." />
                <div className="rounded-2xl border border-dashed border-rule bg-bg/40 p-4 text-sm text-mute">
                  Uploaded documents and per-version acknowledgements arrive with the registration flow.
                </div>
              </div>
            </div>
          ) : null}

          {step === 5 ? (
            <div>
              <h2 className="font-display text-2xl text-ink">Review &amp; publish</h2>
              <p className="mt-1 text-sm text-mute">A quick look before you go live.</p>
              <dl className="mt-6 grid gap-3 sm:grid-cols-2">
                {[
                  { k: "Name", v: title || "—" },
                  { k: "Sport", v: sportMeta(sport).name },
                  { k: "Entry", v: entry === "team" ? "Teams" : "Individuals" },
                  { k: "Visibility", v: visibility === "public" ? "Public" : "Unlisted" },
                  { k: "Starts", v: startsAt ? new Date(startsAt).toLocaleString() : "TBD" },
                  { k: "Venue", v: locName || "TBD" },
                  { k: "Format", v: FORMAT_LABEL[formatType] },
                  { k: "Capacity", v: capacity.trim() === "" ? "Open" : capacity },
                  { k: "Gender", v: genderRule === "open" ? "Open to all" : `${minCount} ${genderRule === "min_women" ? "women" : "men"} min.` },
                  { k: "Registration", v: regOpens || regDeadline ? "Scheduled" : "Not set" },
                ].map((r) => (
                  <div key={r.k} className="rounded-2xl border border-rule bg-bg/40 p-3">
                    <dt className="text-[11px] font-semibold uppercase tracking-wide text-faint">{r.k}</dt>
                    <dd className="mt-0.5 truncate text-sm font-semibold text-ink">{r.v}</dd>
                  </div>
                ))}
              </dl>

              <div className="mt-6 rounded-2xl border border-rule bg-bg/40 p-5">
                {status === "draft" ? (
                  <>
                    <p className="text-sm font-bold text-ink">Ready to go live?</p>
                    <p className="mt-0.5 text-xs text-mute">Publishing makes the public page reachable at klimr.com/e/{init.code}. You can keep editing afterward.</p>
                    <button
                      type="button"
                      onClick={onPublish}
                      disabled={saving || !title.trim()}
                      className="press mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={16} className="animate-spin" /> : <Rocket size={16} />} Publish event
                    </button>
                    {!title.trim() ? <p className="mt-2 text-xs text-brand-deep">Add a name in Basics first.</p> : null}
                  </>
                ) : (
                  <>
                    <p className="flex items-center gap-2 text-sm font-bold text-success">
                      <Check size={16} /> Your event is published
                    </p>
                    <p className="mt-0.5 text-xs text-mute">It&rsquo;s live at klimr.com/e/{init.code}.</p>
                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <a href={`/e/${init.code}`} target="_blank" rel="noopener noreferrer" className="press inline-flex items-center gap-1.5 rounded-xl border border-rule bg-surface px-4 py-2 text-sm font-semibold text-ink hover:border-brand">
                        <Globe size={15} /> View public page
                      </a>
                      <button type="button" onClick={onUnpublish} disabled={saving} className="text-xs font-semibold text-mute hover:text-ink">
                        Move back to draft
                      </button>
                    </div>
                  </>
                )}
              </div>
            </div>
          ) : null}

          {/* footer nav */}
          <div className="mt-8 flex items-center justify-between gap-3 border-t border-rule pt-5">
            <div>
              {step > 0 ? (
                <button type="button" onClick={() => go(step - 1)} disabled={saving} className="press inline-flex items-center gap-1.5 rounded-xl border border-rule bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:border-faint disabled:opacity-50">
                  <ChevronLeft size={16} /> Back
                </button>
              ) : (
                <span />
              )}
            </div>
            <div className="flex items-center gap-3">
              {err ? <span className="text-xs font-semibold text-brand-deep">{err}</span> : savedAt ? <span className="text-xs text-faint">Saved {savedAt}</span> : null}
              {step < LAST ? (
                <button type="button" onClick={() => go(step + 1)} disabled={saving} className="press inline-flex items-center gap-1.5 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : null} Save &amp; continue <ChevronRight size={16} />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
