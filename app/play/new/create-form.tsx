"use client";

import { useActionState, useState } from "react";
import { createMatch } from "./actions";
import { SPORTS } from "@/lib/sports";
import { CourtPicker } from "./court-picker";
import { DateTimePicker } from "./datetime-picker";
import { JoinSuggest } from "./join-suggest";
import type { PickerCourt } from "@/app/courts/search-actions";

export function CreateMatchForm({
  defaultZip,
  defaultSport,
  initialCourt,
}: {
  defaultZip: string;
  defaultSport: string;
  initialCourt: PickerCourt | null;
}) {
  const [state, action, pending] = useActionState(createMatch, undefined);
  const [sport, setSport] = useState<string>(initialCourt?.sport || defaultSport || "");
  const [format, setFormat] = useState<"singles" | "doubles">("singles");
  const [court, setCourt] = useState<PickerCourt | null>(initialCourt);
  const [recurring, setRecurring] = useState(false);
  const [recurrence, setRecurrence] = useState("weekly");

  const defaultSlots = format === "doubles" ? 4 : 2;
  const courtPayload = court
    ? JSON.stringify({
        courtId: court.courtId,
        placeId: court.placeId,
        name: court.name,
        address: court.address,
        lat: court.lat,
        lng: court.lng,
        rating: court.rating,
        ratingCount: court.ratingCount,
        private: court.private,
        sport: court.sport,
        website: court.website,
      })
    : "";

  return (
    <form action={action} className="mt-8">
      <div className="grid gap-x-10 gap-y-8 lg:grid-cols-2">
        {/* LEFT — match details */}
        <div className="space-y-7">
          {/* sport */}
          <div>
            <label className="kicker text-faint">Sport</label>
            <div className="mt-2 grid gap-2" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(104px,1fr))" }}>
              {SPORTS.map((s) => {
                const on = sport === s.key;
                return (
                  <button
                    key={s.key}
                    type="button"
                    onClick={() => setSport(s.key)}
                    aria-pressed={on}
                    className={`press rounded-2xl border px-2 py-3 text-center transition-all ${on ? "-translate-y-0.5 border-[#FFD4BC] bg-tint-brand shadow-[0_10px_28px_-18px_rgba(90,68,35,.45)] ring-2 ring-brand/25" : "border-rule bg-surface hover:-translate-y-0.5 hover:border-rule-2 hover:shadow-e1"}`}
                  >
                    <span className={`block text-[22px] leading-none transition-transform ${on ? "scale-110" : ""}`} aria-hidden>{s.emoji}</span>
                    <span className={`mt-1.5 block text-xs font-bold ${on ? "text-brand-deep" : "text-ink-soft"}`}>{s.name}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* format */}
          <div>
            <label className="kicker text-faint">Format</label>
            <div className="mt-2 inline-flex rounded-full border border-rule p-1">
              {(["singles", "doubles"] as const).map((f) => {
                const on = format === f;
                return (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setFormat(f)}
                    className="press rounded-full px-4 py-1.5 text-sm font-semibold transition-colors"
                    style={{ background: on ? "var(--color-ink)" : "transparent", color: on ? "#fff" : "var(--color-mute)" }}
                  >
                    {f === "singles" ? "Singles" : "Doubles"}
                  </button>
                );
              })}
            </div>
          </div>

          {/* when + slots */}
          <div className="grid gap-5 sm:grid-cols-2">
            <div>
              <label className="kicker text-faint">
                When <span className="font-sans normal-case tracking-normal text-faint">(optional)</span>
              </label>
              <div className="mt-2">
                <DateTimePicker />
              </div>
              <p className="mt-1.5 text-xs text-faint">Leave blank for open / anytime play. Times are in 15-minute steps.</p>
            </div>
            <div>
              <label htmlFor="slots" className="kicker text-faint">Players needed</label>
              <input
                id="slots"
                name="slots"
                type="number"
                min={2}
                max={8}
                defaultValue={defaultSlots}
                key={defaultSlots}
                className="mt-2 w-full rounded-[10px] border border-rule-2 bg-surface px-3.5 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
              />
              <p className="mt-1.5 text-xs text-faint">Including you. {format === "doubles" ? "Doubles is usually 4." : "Singles is 2."}</p>
            </div>
          </div>

          {/* recurring */}
          <div>
            <label className="flex items-center gap-3">
              <input
                type="checkbox"
                checked={recurring}
                onChange={(e) => setRecurring(e.target.checked)}
                className="h-4 w-4 accent-brand"
              />
              <span className="text-sm text-ink">This is a recurring game</span>
            </label>
            {recurring ? (
              <div className="mt-3 pl-7">
                <label htmlFor="recurrence" className="kicker text-faint">How often</label>
                <select
                  id="recurrence"
                  value={recurrence}
                  onChange={(e) => setRecurrence(e.target.value)}
                  className="mt-1.5 w-full rounded-[10px] border border-rule-2 bg-surface px-3.5 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15 sm:w-56"
                >
                  <option value="weekly">Every week</option>
                  <option value="biweekly">Every 2 weeks</option>
                  <option value="monthly">Every month</option>
                </select>
                <p className="mt-1.5 text-xs text-faint">Pick a date &amp; time above so players know when it repeats.</p>
              </div>
            ) : null}
          </div>
        </div>

        {/* RIGHT — court + note */}
        <div className="space-y-6">
          <CourtPicker sport={sport} defaultZip={defaultZip} selected={court} onSelect={setCourt} />

          <div>
            <label htmlFor="location" className="kicker text-faint">
              {court ? "Note " : "Or type a location "}
              <span className="font-sans normal-case tracking-normal text-faint">(optional)</span>
            </label>
            <input
              id="location"
              name="location"
              type="text"
              placeholder={court ? "e.g. court 3, meet by the gate" : "e.g. Mar Vista Rec Center, court 3"}
              maxLength={120}
              className="mt-2 w-full rounded-[10px] border border-rule-2 bg-surface px-3.5 py-2.5 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
            />
            <p className="mt-1.5 text-xs text-faint">
              {court ? "Add a specific court number or meeting spot." : "If your court isn't listed above, just type where to meet."}
            </p>
          </div>
        </div>
      </div>

      <input type="hidden" name="sport" value={sport} />
      <input type="hidden" name="format" value={format} />
      <input type="hidden" name="court_payload" value={courtPayload} />
      <input type="hidden" name="recurring" value={recurring ? "on" : ""} />
      <input type="hidden" name="recurrence" value={recurring ? recurrence : ""} />

      <JoinSuggest sport={sport} zip={defaultZip ?? ""} />

      {state?.error ? (
        <p className="mt-6 rounded-xl border border-brand/30 bg-tint-brand px-4 py-3 text-sm text-brand-deep">{state.error}</p>
      ) : null}

      <div className="mt-8 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending || !sport}
          className="press rounded-full px-5 py-2.5 text-sm font-bold text-white shadow-flame transition-[filter] hover:brightness-[1.06] disabled:opacity-50" style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}
        >
          {pending ? "Creating…" : "Create match"}
        </button>
        <span className="text-xs text-faint">You&rsquo;ll be seated automatically as the organizer.</span>
      </div>
    </form>
  );
}
