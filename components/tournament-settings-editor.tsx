"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Loader2, MapPin, Globe, Lock, Rocket } from "lucide-react";
import { Toggle, Segmented, OptionCards } from "@/components/form-kit";
import { SPORTS, sportMeta } from "@/lib/sports";
import { isoToLocalInput, localInputToIso, type FormatType, type TournamentDraftPatch } from "@/lib/tournament";
import { updateTournamentDraft, publishTournament, unpublishTournament } from "@/app/tournaments/actions";
import { resolveTeamZip } from "@/app/teams/actions";

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

const inputCls = "w-full rounded-xl border border-rule bg-bg px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-brand";
const labelCls = "mb-1.5 block text-xs font-semibold uppercase tracking-wide text-mute";
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
  onSave: () => Promise<{ ok: boolean; error?: string }>;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function handle() {
    setBusy(true);
    setMsg(null);
    const res = await onSave();
    if (res.ok) {
      setMsg({ ok: true, text: "Saved" });
      router.refresh();
    } else {
      setMsg({ ok: false, text: res.error ?? "Couldn't save." });
    }
    setBusy(false);
  }

  return (
    <section id={id} className="scroll-mt-24 rounded-3xl border border-rule bg-surface p-5 sm:p-6">
      <h2 className="text-base font-bold text-ink">{title}</h2>
      {desc ? <p className="mt-0.5 text-sm text-mute">{desc}</p> : null}
      <div className="mt-5 grid gap-5">{children}</div>
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
  async function handle() {
    setBusy(true);
    setMsg(null);
    const res = await updateTournamentDraft(init.id, { visibility });
    if (res.ok) {
      setMsg({ ok: true, text: "Saved" });
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

export function TournamentSettingsEditor({ init }: { init: SettingsInit }) {
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

  // Format & eligibility
  const [formatType, setFormatType] = useState<FormatType>(init.format_type);
  const [poolCount, setPoolCount] = useState(String(init.pool_count || 2));
  const [rosterSize, setRosterSize] = useState(String(init.roster_size || 2));
  const [capacity, setCapacity] = useState(init.capacity != null ? String(init.capacity) : "");
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

  return (
    <div className="grid gap-4">
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

      <SectionCard
        id="location"
        title="Date & location"
        desc="When and where your event happens."
        onSave={() =>
          save({
            starts_at: localInputToIso(startsAt),
            ends_at: localInputToIso(endsAt),
            timezone: tz.trim() || null,
            location_name: locName.trim() || null,
            location_address: locAddr.trim() || null,
            zip: locZip.trim() || undefined,
            weather_enabled: weather,
          })
        }
      >
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
            format_config: { format_type: formatType, pool_count: n(poolCount) || 2, roster_size: n(rosterSize) || 2 },
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
          <p className={hintCls}>Court count is set on the Schedule page when you build the match schedule.</p>
        </div>
      </SectionCard>

      <SectionCard
        id="registration"
        title="Registration window"
        desc="When sign-ups open and close."
        onSave={() => save({ registration_opens_at: localInputToIso(regOpens), registration_deadline: localInputToIso(regDeadline) })}
      >
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
          Entry categories &amp; fees live in{" "}
          <Link href={`/tournament/${init.id}/divisions`} className="font-semibold text-brand-deep hover:underline">
            Divisions
          </Link>
          ; custom sign-up questions live in{" "}
          <Link href={`/tournament/${init.id}/form`} className="font-semibold text-brand-deep hover:underline">
            Sign-up form
          </Link>
          .
        </div>
      </SectionCard>

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

      <section id="visibility" className="scroll-mt-24 rounded-3xl border border-rule bg-surface p-5 sm:p-6">
        <h2 className="text-base font-bold text-ink">Visibility &amp; publishing</h2>
        <p className="mt-0.5 text-sm text-mute">Control discovery and whether your event is live.</p>

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
              disabled={pubBusy}
              className={`press inline-flex items-center gap-2 rounded-full px-5 py-2.5 text-sm font-semibold transition disabled:opacity-50 ${isDraft ? "bg-brand text-white hover:bg-brand-deep" : "border border-rule bg-surface text-ink hover:bg-bg"}`}
            >
              {pubBusy ? <Loader2 size={15} className="animate-spin" /> : isDraft ? <Rocket size={15} /> : null}
              {isDraft ? "Publish event" : "Unpublish"}
            </button>
          </div>
          {pubErr ? <p className="mt-2 text-sm font-semibold text-brand-deep">{pubErr}</p> : null}
        </div>
      </section>
    </div>
  );
}
