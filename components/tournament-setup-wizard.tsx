"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Check, ChevronLeft, ChevronRight, Loader2, MapPin, Scale } from "lucide-react";
import { Toggle, Segmented, OptionCards } from "@/components/form-kit";
import { SPORTS, sportMeta } from "@/lib/sports";
import { FORMAT_LABEL, isoToLocalInput, localInputToIso, type FormatType, type TournamentDraftPatch } from "@/lib/tournament";
import { createTournamentFromWizard } from "@/app/tournaments/actions";
import { resolveTeamZip } from "@/app/teams/actions";

type Init = {
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

export function TournamentSetupWizard({ init }: { init: Init }) {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);

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

  function go(to: number) {
    setStep(Math.min(Math.max(to, 0), LAST));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Create-at-end: build the full row and write it once, then enter the workspace.
  async function onCreate() {
    setErr(null);
    if (!title.trim()) {
      setErr("Add a tournament name in Basics first.");
      setStep(0);
      return;
    }
    if (!agree) {
      setErr("Please accept the organizer terms to create your event.");
      return;
    }
    setSaving(true);
    try {
      const res = await createTournamentFromWizard(buildPatch(), agree);
      if (res.ok) {
        router.push(`/tournament/${res.id}`);
      } else {
        setErr(res.error);
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
                  Entry categories &amp; fees, and custom sign-up questions, are set up after you create the event — in <span className="font-semibold text-ink">Divisions</span> and <span className="font-semibold text-ink">Sign-up form</span> in your event workspace.
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
              <h2 className="font-display text-2xl text-ink">Review &amp; create</h2>
              <p className="mt-1 text-sm text-mute">A last look before your event is created.</p>
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

              <div className="mt-6 space-y-4">
                  <div className="rounded-2xl border border-rule bg-bg/40 p-4">
                    <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink">
                      <Scale size={15} className="text-brand-deep" /> Organizer terms &amp; legal disclaimer
                    </h3>
                    <p className="mt-1 text-xs text-faint">Please read before creating. A summary of your responsibilities as an organizer — not legal advice.</p>
                    <div className="mt-3 max-h-60 space-y-3 overflow-y-auto rounded-xl border border-rule bg-surface p-4 text-xs leading-relaxed text-mute">
                      <p><strong className="text-ink">1. Klimr is a platform, not the organizer.</strong> Klimr provides software to help you create, promote, and run your event. You — the organizer — are solely responsible for the event itself, including its planning, conduct, supervision, and outcome. Klimr is not a host, promoter, sponsor, operator, or co-organizer of any event, and does not endorse, vet, or guarantee any event, organizer, venue, or participant.</p>
                      <p><strong className="text-ink">2. Compliance with laws.</strong> You are responsible for ensuring your event complies with all applicable federal, state, provincial, and local laws, ordinances, and regulations, including those governing public gatherings, athletic competitions, amateur and youth sport, alcohol, food service, noise, accessibility, consumer protection, prize and contest rules, and the collection of any entry fees.</p>
                      <p><strong className="text-ink">3. Permits, venue rights &amp; licenses.</strong> You must obtain — and keep current — every permit, license, reservation, and written permission your event requires, including government and municipal permits, park or facility use agreements, the right to use any courts, fields, or premises, and any sanctioning required by a governing body. You may not list a venue you are not authorized to use.</p>
                      <p><strong className="text-ink">4. Insurance.</strong> You are responsible for carrying adequate insurance for your event, including general liability coverage and any participant accident, property, or other coverage appropriate to the activity, the venue, and the number of participants.</p>
                      <p><strong className="text-ink">5. Participant safety &amp; waivers.</strong> You are responsible for the safety of participants, spectators, staff, and volunteers, for appropriate medical and emergency planning, and for obtaining any liability waivers, releases, and (for minors) parental or guardian consents your event and jurisdiction require. Waiver and rules text you add in Klimr is yours and is your responsibility.</p>
                      <p><strong className="text-ink">6. Fees, payments &amp; taxes.</strong> Any entry fees, refunds, and related disputes are between you and your participants. Klimr does not currently process payments on your behalf; you are responsible for collecting fees, issuing refunds, honoring your stated refund policy, and reporting and paying all applicable taxes.</p>
                      <p><strong className="text-ink">7. Eligibility, fair play &amp; non-discrimination.</strong> You must run your event fairly and lawfully, must not unlawfully discriminate against any participant, and are responsible for enforcing your stated eligibility, conduct, and anti-doping rules. You must comply with Klimr&rsquo;s Terms of Service and Community Guidelines at all times.</p>
                      <p><strong className="text-ink">8. Data &amp; privacy.</strong> You must handle participant information lawfully, use it only to operate your event, and comply with applicable privacy laws. Do not export, sell, or repurpose participant data obtained through Klimr.</p>
                      <p><strong className="text-ink">9. Intellectual property &amp; sponsorship.</strong> You are responsible for the rights to any names, logos, images, trademarks, and sponsorships used in connection with your event, and for any sponsor or governing-body obligations.</p>
                      <p><strong className="text-ink">10. Indemnification.</strong> To the fullest extent permitted by law, you agree to indemnify, defend, and hold harmless Klimr and its affiliates, officers, employees, and agents from any claims, damages, liabilities, losses, fines, penalties, and expenses (including reasonable legal fees) arising out of or related to your event, your use of the hosting tools, or your breach of these terms.</p>
                      <p><strong className="text-ink">11. No warranty; limitation of liability.</strong> The hosting tools are provided &ldquo;as is,&rdquo; without warranties of any kind. To the fullest extent permitted by law, Klimr is not liable for any injury, loss, or damage arising from any event, and Klimr&rsquo;s total liability relating to the hosting tools is limited as set out in the Klimr Terms of Service.</p>
                      <p><strong className="text-ink">12. Removal &amp; enforcement.</strong> Klimr may remove, unpublish, or refuse any event or organizer, at its discretion, including for suspected illegality, safety risk, fraud, or violation of these terms or the Terms of Service.</p>
                      <p className="text-faint"><strong className="text-mute">Not legal advice.</strong> This summary is for convenience and does not constitute legal advice. Requirements vary by location and event type. We strongly recommend consulting a qualified attorney and your insurer before hosting. Your use of the hosting tools is also governed by the Klimr <Link href="/legal" className="font-semibold text-brand-deep hover:underline">Terms of Service</Link>.</p>
                    </div>
                    <label className="mt-3 flex items-start gap-2.5 text-sm text-ink">
                      <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-[#ff4e1b]" />
                      <span>I have read and accept the organizer terms, and I confirm I will comply with all applicable laws and hold any required insurance, permits, and licenses for my event.</span>
                    </label>
                  </div>

                  <div className="rounded-2xl border border-rule bg-bg/40 p-5">
                    <p className="text-sm font-bold text-ink">Create your event</p>
                    <p className="mt-0.5 text-xs text-mute">Saved as a private draft — hidden from the public until you publish it from the dashboard. <span className="text-brand-deep">Free during launch.</span></p>
                    <button
                      type="button"
                      onClick={onCreate}
                      disabled={saving || !title.trim() || !agree}
                      className="press mt-4 inline-flex items-center gap-2 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Create event
                    </button>
                    {!title.trim() ? <p className="mt-2 text-xs text-brand-deep">Add a name in Basics first.</p> : null}
                  </div>
                </div>
            </div>
          ) : null}

          {/* footer nav */}
          <div className="mt-8 flex items-center justify-between gap-3 border-t border-rule pt-5">
            <div className="flex items-center gap-2">
              {step > 0 ? (
                <button type="button" onClick={() => go(step - 1)} disabled={saving} className="press inline-flex items-center gap-1.5 rounded-xl border border-rule bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:border-faint disabled:opacity-50">
                  <ChevronLeft size={16} /> Back
                </button>
              ) : null}
              <Link href="/tournaments" className="press inline-flex items-center gap-1.5 rounded-xl border border-rule bg-surface px-4 py-2.5 text-sm font-semibold text-mute hover:text-ink">
                Cancel
              </Link>
            </div>
            <div className="flex items-center gap-3">
              {err ? <span className="text-xs font-semibold text-brand-deep">{err}</span> : null}
              {step < LAST ? (
                <button type="button" onClick={() => go(step + 1)} disabled={saving} className="press inline-flex items-center gap-1.5 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50">
                  {saving ? <Loader2 size={16} className="animate-spin" /> : null} Continue <ChevronRight size={16} />
                </button>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
