"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { ReactNode } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, MapPin, Globe, Lock, Rocket } from "lucide-react";
import { Toggle, Segmented, OptionCards } from "@/components/form-kit";
import { SettingsShell, type SettingsSection } from "@/components/settings-shell";
import { SPORTS, sportMeta } from "@/lib/sports";
import { isoToLocalInput, localInputToIso, PUBLIC_BG_OPTIONS, type FormatType, type TournamentDraftPatch } from "@/lib/tournament";
import { updateTournamentDraft, publishTournament, unpublishTournament } from "@/app/tournaments/actions";
import { resolveTeamZip } from "@/app/teams/actions";
import { DateTimeField } from "@/components/date-time-field";

export type SettingsInit = {
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
  location_url: string | null;
  location_zip: string | null;
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
  courts: string[] | null;
  waiver_text: string;
  rules_text: string;
  require_waiver: boolean;
  require_rules: boolean;
  signupFormReady: boolean;
  public_bg: string;
  capacity_mode: "pooled" | "per_division";
  capacity_unit: "team" | "person";
};

const inputCls = "w-full rounded-xl border border-rule bg-bg px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-brand";
const labelCls = "mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-mute";
const hintCls = "mt-1.5 text-xs text-mute";
const n = (v: string) => Math.max(parseInt(v || "0", 10) || 0, 0);

/** Card shell with its own Save button + status, so each section saves on its
 *  own without touching the others. `onSave` builds the patch from current state. */
function SectionCard({
  id,
  title,
  desc,
  onSave,
  children,
}: {
  id: string;
  title: string;
  desc?: string;
  onSave: () => Promise<{ ok: boolean; error?: string; reconcile?: { waitlisted: number; promoted: number; scheduleReset: boolean } }>;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);
  const clearMsg = () => setMsg(null);

  async function handle() {
    setBusy(true);
    setMsg(null);
    const res = await onSave();
    if (res.ok) {
      const r = res.reconcile;
      const parts: string[] = [];
      if (r?.waitlisted) parts.push(`${r.waitlisted} moved to waitlist`);
      if (r?.promoted) parts.push(`${r.promoted} promoted from waitlist`);
      if (r?.scheduleReset) parts.push("schedule reset — rebuild the day plan");
      setMsg({ ok: true, text: parts.length ? `Saved · ${parts.join(" · ")}` : "Saved" });
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setMsg(null), parts.length ? 8000 : 3000);
      router.refresh();
    } else {
      setMsg({ ok: false, text: res.error ?? "Couldn't save." });
    }
    setBusy(false);
  }

  return (
    <section id={id} className="scroll-mt-24 rounded-3xl border border-rule bg-surface shadow-e1 p-5 sm:p-6">
      <div className="flex items-start gap-2.5">
        <span className="mt-1 h-5 w-1 shrink-0 rounded-full bg-gradient-to-b from-brand to-brand-deep" />
        <div>
          <h2 className="text-lg font-bold tracking-tight text-ink">{title}</h2>
          {desc ? <p className="mt-0.5 text-sm text-mute">{desc}</p> : null}
        </div>
      </div>
      <div className="mt-5 grid gap-5" onInput={clearMsg} onClickCapture={clearMsg}>{children}</div>
      <div className="mt-5 flex items-center gap-3">
        <button
          type="button"
          onClick={handle}
          disabled={busy}
          className="press inline-flex items-center gap-2 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface transition hover:bg-ink-soft disabled:opacity-50"
        >
          {busy ? <Loader2 size={15} className="animate-spin" /> : null} Save changes
        </button>
        {msg ? <span className={`text-sm font-semibold ${msg.ok ? "text-success" : "text-brand-deep"}`}>{msg.text}</span> : null}
      </div>
    </section>
  );
}

function VisibilityRow({ init }: { init: SettingsInit }) {
  const router = useRouter();
  const [visibility, setVisibility] = useState<"public" | "unlisted">(init.visibility);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const flashTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (flashTimer.current) clearTimeout(flashTimer.current); }, []);
  async function handle() {
    setBusy(true);
    setMsg(null);
    const res = await updateTournamentDraft(init.id, { visibility });
    if (res.ok) {
      setMsg({ ok: true, text: "Saved" });
      if (flashTimer.current) clearTimeout(flashTimer.current);
      flashTimer.current = setTimeout(() => setMsg(null), 3000);
      router.refresh();
    } else {
      setMsg({ ok: false, text: res.error ?? "Couldn't save." });
    }
    setBusy(false);
  }
  return (
    <div>
      <label className={labelCls}>Discovery</label>
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
      <div className="mt-3 flex items-center gap-3">
        <button type="button" onClick={handle} disabled={busy} className="press inline-flex items-center gap-2 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface transition hover:bg-ink-soft disabled:opacity-50">
          {busy ? <Loader2 size={14} className="animate-spin" /> : null} Save
        </button>
        {msg ? <span className={`text-sm font-semibold ${msg.ok ? "text-success" : "text-brand-deep"}`}>{msg.text}</span> : null}
      </div>
    </div>
  );
}

export function TournamentSettingsEditor({ init, divisionsSlot, gallerySlot, dangerSlot, liveContext }: { init: SettingsInit; divisionsSlot?: ReactNode; gallerySlot?: ReactNode; dangerSlot?: ReactNode; liveContext?: { entries: number; scheduled: boolean } }) {
  const router = useRouter();
  const save = (patch: TournamentDraftPatch) => updateTournamentDraft(init.id, patch);

  // Details
  const [title, setTitle] = useState(init.title);
  const [summary, setSummary] = useState(init.summary);
  const [description, setDescription] = useState(init.description);
  const [sport, setSport] = useState(init.sport_key);
  const [entry, setEntry] = useState<"individual" | "team">(init.entry_type);

  // Date & location
  const [startsAt, setStartsAt] = useState(isoToLocalInput(init.starts_at));
  const [endsAt, setEndsAt] = useState(isoToLocalInput(init.ends_at));
  const [locName, setLocName] = useState(init.location_name ?? "");
  const [locAddr, setLocAddr] = useState(init.location_address ?? "");
  const [locUrl, setLocUrl] = useState(init.location_url ?? "");
  const [locZip, setLocZip] = useState(init.location_zip ?? "");
  const [locResolved, setLocResolved] = useState<{ city: string; state: string } | null>(null);
  const [, startZip] = useTransition();
  const onLocZip = (v: string) => {
    const z = v.replace(/\D/g, "").slice(0, 5);
    setLocZip(z);
    setLocResolved(null);
    if (z.length === 5) startZip(async () => setLocResolved(await resolveTeamZip(z)));
  };
  const [weather, setWeather] = useState(init.weather_enabled);

  // Format & eligibility
  const [formatType, setFormatType] = useState<FormatType>(init.format_type);
  const [poolCount, setPoolCount] = useState(String(init.pool_count || 2));
  const [rosterSize, setRosterSize] = useState(String(init.roster_size || 2));
  const [courtList, setCourtList] = useState<string[]>(init.courts && init.courts.length ? init.courts : ["Court 1", "Court 2"]);
  const setCourtCount = (nStr: string) => {
    const k = Math.max(1, Math.min(50, parseInt(nStr || "1", 10) || 1));
    setCourtList((prev) => {
      const next = prev.slice(0, k);
      for (let i = prev.length; i < k; i++) next.push(`Court ${i + 1}`);
      return next;
    });
  };
  const [capacity, setCapacity] = useState(init.capacity != null ? String(init.capacity) : "");
  const [capacityMode, setCapacityMode] = useState<"pooled" | "per_division">(init.capacity_mode);
  const [capacityUnit, setCapacityUnit] = useState<"team" | "person">(init.capacity_unit);
  const [reserves, setReserves] = useState(String(init.reserves_allowed ?? 0));
  const [genderRule, setGenderRule] = useState<"open" | "min_women" | "min_men">(
    init.min_women > 0 ? "min_women" : init.min_men > 0 ? "min_men" : "open",
  );
  const [minCount, setMinCount] = useState(String(init.min_women > 0 ? init.min_women : init.min_men > 0 ? init.min_men : 1));
  const reserveMax = sport === "beach_volleyball" ? 2 : 4;

  // Registration window
  const [regOpens, setRegOpens] = useState(isoToLocalInput(init.registration_opens_at));
  const [regDeadline, setRegDeadline] = useState(isoToLocalInput(init.registration_deadline));

  // Legal
  const [waiver, setWaiver] = useState(init.waiver_text);
  const [rules, setRules] = useState(init.rules_text);
  const [reqWaiver, setReqWaiver] = useState(init.require_waiver);
  const [reqRules, setReqRules] = useState(init.require_rules);

  // public page appearance
  const [publicBg, setPublicBg] = useState(init.public_bg);

  // Publishing
  const [pubBusy, setPubBusy] = useState(false);
  const [pubErr, setPubErr] = useState<string | null>(null);
  const isDraft = init.status === "draft";
  const isPublic = !["draft", "cancelled"].includes(init.status);

  async function togglePublish() {
    setPubBusy(true);
    setPubErr(null);
    const res = isDraft ? await publishTournament(init.id) : await unpublishTournament(init.id);
    if (res.ok) router.refresh();
    else setPubErr(res.error ?? "Couldn't update.");
    setPubBusy(false);
  }

  const sections: SettingsSection[] = [
    {
      key: "details",
      label: "Event details",
      content: (
      <SectionCard
        id="details"
        title="Event details"
        desc="Name, sport, and what players see."
        onSave={() => save({ title: title.trim(), summary: summary.trim() || null, description: description.trim() || null, sport_key: sport, entry_type: entry })}
      >
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
          <label className={labelCls}>About</label>
          <textarea className={`${inputCls} min-h-32 resize-y`} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Format, what to bring, prizes, schedule overview…" />
        </div>
      </SectionCard>
      ),
    },
    {
      key: "location",
      label: "Date & location",
      content: (
      <SectionCard
        id="location"
        title="Date & location"
        desc="When and where your event happens."
        onSave={() =>
          save({
            starts_at: localInputToIso(startsAt),
            ends_at: localInputToIso(endsAt),
            location_name: locName.trim() || null,
            location_address: locAddr.trim() || null,
            location_url: locUrl.trim() || null,
            zip: locZip.trim() || undefined,
            weather_enabled: weather,
          })
        }
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Starts</label>
            <DateTimeField value={startsAt} onChange={setStartsAt} ariaLabel="Start" />
          </div>
          <div>
            <label className={labelCls}>Ends <span className="font-normal normal-case text-faint">(optional)</span></label>
            <DateTimeField value={endsAt} onChange={setEndsAt} optional ariaLabel="End" />
          </div>
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
        <div>
          <label className={labelCls}>Google Maps link <span className="font-normal normal-case text-faint">(optional)</span></label>
          <input className={inputCls} value={locUrl} onChange={(e) => setLocUrl(e.target.value)} placeholder="https://maps.app.goo.gl/…" inputMode="url" />
          <p className={`${hintCls} mt-1`}>Paste a Google Maps share link to control exactly where the map on your public page points. Leave blank to use the venue name and address.</p>
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
                <>
                  Places this event near <span className="font-semibold text-ink">{locResolved.city}, {locResolved.state}</span> for local discovery.
                </>
              ) : (
                <>Set a ZIP to (re)place this event for local discovery. Leave blank to keep the current location.</>
              )}
            </p>
          </div>
        </div>
        <Toggle checked={weather} onChange={setWeather} label="Show a weather forecast" description="Display the venue's forecast on the public page, powered by Open-Meteo." />
      </SectionCard>
      ),
    },
    {
      key: "format",
      label: "Format & eligibility",
      content: (
      <SectionCard
        id="format"
        title="Format & eligibility"
        desc="How the competition runs and who can enter."
        onSave={() =>
          save({
            capacity: capacity.trim() === "" ? null : n(capacity),
            reserves_allowed: Math.min(n(reserves), reserveMax),
            min_women: genderRule === "min_women" ? n(minCount) : 0,
            min_men: genderRule === "min_men" ? n(minCount) : 0,
            format_config: { format_type: formatType, pool_count: n(poolCount) || 2, roster_size: n(rosterSize) || 2, courts: courtList.map((c, i) => c.trim() || `Court ${i + 1}`), capacity_mode: capacityMode, capacity_unit: entry === "team" ? capacityUnit : "person" },
          })
        }
      >
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
        <div className="rounded-2xl border border-rule bg-bg/40 p-4">
          <div className="sm:max-w-xs">
            <label className={labelCls}>Number of courts</label>
            <input type="number" min={1} max={50} className={inputCls} value={courtList.length} onChange={(e) => setCourtCount(e.target.value)} />
          </div>
          <p className={hintCls}>Name or number each court — these label the matches when you build the schedule.</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {courtList.map((label, i) => (
              <input
                key={i}
                className={inputCls}
                value={label}
                aria-label={`Court ${i + 1} name`}
                onChange={(e) => { const next = [...courtList]; next[i] = e.target.value; setCourtList(next); }}
                placeholder={`Court ${i + 1}`}
              />
            ))}
          </div>
        </div>
        <div className="rounded-2xl border border-rule bg-bg/40 p-4">
          <label className={labelCls}>Capacity</label>
          {liveContext && (liveContext.entries > 0 || liveContext.scheduled) ? (
            <p className="mb-2 mt-1 rounded-xl border border-[#F1E0B6] bg-[#FDF3DD] px-3 py-2 text-xs font-semibold text-[#B45309]">
              {liveContext.entries > 0 ? `${liveContext.entries} live ${liveContext.entries === 1 ? "entry" : "entries"} — lowering caps moves the newest over-cap entries to the waitlist.` : ""}
              {liveContext.scheduled ? " Changing these rules resets the built pools & bracket." : ""}
            </p>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-faint">Limit by</p>
              <Segmented
                ariaLabel="Capacity mode"
                value={capacityMode}
                onChange={setCapacityMode}
                options={[
                  { value: "pooled", label: "Shared total" },
                  { value: "per_division", label: "Per division" },
                ]}
              />
            </div>
            {entry === "team" ? (
              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-faint">Count by</p>
                <Segmented
                  ariaLabel="Capacity unit"
                  value={capacityUnit}
                  onChange={setCapacityUnit}
                  options={[
                    { value: "team", label: "Teams" },
                    { value: "person", label: "Players" },
                  ]}
                />
              </div>
            ) : null}
          </div>
          <div className="mt-4 grid gap-4 sm:grid-cols-2">
            {capacityMode === "pooled" ? (
              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-faint">Shared total</p>
                <input type="number" min={0} className={inputCls} value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Unlimited" />
                <p className={hintCls}>Max {entry === "team" ? (capacityUnit === "person" ? "players" : "teams") : "players"} across all divisions combined.</p>
              </div>
            ) : (
              <div className="flex items-center rounded-xl border border-dashed border-rule bg-surface px-3.5 py-2.5">
                <p className="text-xs text-mute">Each division has its own cap — set them in the <Link href="#divisions" className="font-semibold text-brand-deep hover:underline">Divisions &amp; fees section</Link> below.</p>
              </div>
            )}
            {entry === "team" ? (
              <div>
                <p className="mb-1.5 text-[11px] font-bold uppercase tracking-wider text-faint">Reserves per team</p>
                <input type="number" min={0} max={reserveMax} className={inputCls} value={reserves} onChange={(e) => setReserves(e.target.value)} />
                <p className={hintCls}>Up to {reserveMax} for {sportMeta(sport).name}.</p>
              </div>
            ) : null}
          </div>
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
          <p className={hintCls}>Court count is set on the Schedule page when you build the match schedule.</p>
        </div>
      </SectionCard>
      ),
    },
    {
      key: "registration",
      label: "Registration window",
      content: (
      <SectionCard
        id="registration"
        title="Registration window"
        desc="When sign-ups open and close."
        onSave={() => save({ registration_opens_at: localInputToIso(regOpens), registration_deadline: localInputToIso(regDeadline) })}
      >
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <label className={labelCls}>Registration opens</label>
            <DateTimeField value={regOpens} onChange={setRegOpens} optional ariaLabel="Registration opens" />
          </div>
          <div>
            <label className={labelCls}>Registration deadline</label>
            <DateTimeField value={regDeadline} onChange={setRegDeadline} optional ariaLabel="Registration deadline" />
          </div>
        </div>
        <div className="rounded-2xl border border-dashed border-rule bg-bg/40 p-4 text-sm text-mute">
          Entry categories &amp; fees live in{" "}
          <Link href="#divisions" className="font-semibold text-brand-deep hover:underline">
            Divisions &amp; fees
          </Link>
          ; custom sign-up questions live in{" "}
          <Link href={`/tournament/${init.id}/form`} className="font-semibold text-brand-deep hover:underline">
            Sign-up form
          </Link>
          .
        </div>
      </SectionCard>
      ),
    },
    {
      key: "legal",
      label: "Legal",
      content: (
      <SectionCard
        id="legal"
        title="Legal"
        desc="Waiver and rules players agree to."
        onSave={() => save({ format_config: { legal: { waiver_text: waiver.trim(), rules_text: rules.trim(), require_waiver: reqWaiver, require_rules: reqRules } } })}
      >
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
      </SectionCard>
      ),
    },
    {
      key: "appearance",
      label: "Public page background",
      content: (
      <SectionCard
        id="appearance"
        title="Public page background"
        desc="Choose a background colour for your public event page. White cards sit on top, so each option stays light and keeps text easy to read — pick the one that fits your event's vibe."
        onSave={() => save({ format_config: { public_bg: publicBg } })}
      >
        <div className="flex flex-wrap gap-3">
          {PUBLIC_BG_OPTIONS.map((o) => {
            const active = publicBg === o.key;
            return (
              <button
                key={o.key}
                type="button"
                onClick={() => setPublicBg(o.key)}
                aria-pressed={active}
                aria-label={o.label}
                className={`flex flex-col items-center gap-1.5 rounded-2xl border p-2 transition ${active ? "border-brand ring-2 ring-brand/30" : "border-rule hover:border-faint"}`}
              >
                {/* swatch with a mini white "card" to preview how content floats on the colour */}
                <span className="grid h-14 w-20 place-items-center rounded-xl border border-rule" style={{ backgroundColor: o.hex }}>
                  <span className="h-7 w-12 rounded-md bg-white shadow-sm" />
                </span>
                <span className={`text-xs font-semibold ${active ? "text-ink" : "text-mute"}`}>{o.label}</span>
              </button>
            );
          })}
        </div>
      </SectionCard>
      ),
    },
    {
      key: "visibility",
      label: "Visibility & publishing",
      content: (
      <section id="visibility" className="scroll-mt-24 rounded-3xl border border-rule bg-surface shadow-e1 p-5 sm:p-6">
        <div className="flex items-start gap-2.5">
          <span className="mt-1 h-5 w-1 shrink-0 rounded-full bg-gradient-to-b from-brand to-brand-deep" />
          <div>
            <h2 className="text-lg font-bold tracking-tight text-ink">Visibility &amp; publishing</h2>
            <p className="mt-0.5 text-sm text-mute">Control discovery and whether your event is live.</p>
          </div>
        </div>

        <div className="mt-5">
          <VisibilityRow init={init} />
        </div>

        <div className="mt-5 border-t border-rule pt-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-sm font-semibold">
              {isPublic ? (
                <>
                  <Globe size={16} className="text-success" /> <span className="text-ink">Live</span>
                  <a href={`/e/${init.code}`} target="_blank" rel="noopener noreferrer" className="ml-1 font-semibold text-brand-deep hover:underline">
                    View public page →
                  </a>
                </>
              ) : (
                <>
                  <Lock size={16} className="text-faint" /> <span className="text-mute">Not published — only you can see it</span>
                </>
              )}
            </div>
            <button
              type="button"
              onClick={togglePublish}
              disabled={pubBusy || (isDraft && !init.signupFormReady)}
              className={`press inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${isDraft ? "bg-brand text-white hover:bg-brand-deep" : "border border-rule bg-surface text-ink hover:bg-bg"}`}
            >
              {pubBusy ? <Loader2 size={15} className="animate-spin" /> : isDraft ? <Rocket size={15} /> : null}
              {isDraft ? "Publish event" : "Unpublish"}
            </button>
          </div>
          {isDraft && !init.signupFormReady ? (
            <p className="mt-2 text-xs text-mute">
              Set up your{" "}
              <a href={`/tournament/${init.id}/form`} className="font-semibold text-brand-deep hover:underline">
                sign-up form
              </a>{" "}
              before publishing — open it and save, even if you’re not adding extra questions.
            </p>
          ) : null}
          {pubErr ? <p className="mt-2 text-sm font-semibold text-brand-deep">{pubErr}</p> : null}
        </div>
      </section>
      ),
    },
  ];
  // Divisions & fees sits right after Format & eligibility (it defines the
  // categories and pricing that flow from the event's format).
  if (divisionsSlot) {
    const fi = sections.findIndex((s) => s.key === "format");
    sections.splice(fi >= 0 ? fi + 1 : sections.length, 0, { key: "divisions", label: "Divisions & fees", content: divisionsSlot });
  }
  if (gallerySlot) sections.push({ key: "photos", label: "Event photos", content: gallerySlot });
  if (dangerSlot) sections.push({ key: "danger", label: "Danger zone", content: dangerSlot });

  return <SettingsShell sections={sections} ariaLabel="Tournament settings" />;
}
