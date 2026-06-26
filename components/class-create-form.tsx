"use client";

import { useState } from "react";
import { SPORTS } from "@/lib/sports";
import { createClass } from "@/app/classes/actions";

function isoFromLocal(v: string): string {
  if (!v) return "";
  const d = new Date(v); // arg form — interpreted in the browser's local timezone
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}

const field = "w-full rounded-xl border border-rule bg-bg px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-brand";
const labelCls = "mb-1 block text-xs font-semibold text-mute";

const FORMATS = [
  ["group_class", "Group class"],
  ["clinic", "Clinic"],
  ["private_lesson", "Private lesson"],
  ["workshop", "Workshop"],
  ["camp", "Camp"],
  ["open_play", "Open play"],
] as const;
const LEVELS = [
  ["all", "All levels"],
  ["beginner", "Beginner"],
  ["intermediate", "Intermediate"],
  ["advanced", "Advanced"],
  ["pro", "Pro / competitive"],
] as const;
const AGES = [
  ["all_ages", "All ages"],
  ["adults", "Adults (18+)"],
  ["youth", "Youth (under 18)"],
  ["seniors", "Seniors (55+)"],
] as const;
const GENDERS = [
  ["all", "Open to all"],
  ["women", "Women only"],
  ["men", "Men only"],
] as const;

export function ClassCreateForm() {
  const [paid, setPaid] = useState(false);
  const [recurrence, setRecurrence] = useState<"one_off" | "recurring">("one_off");
  const [start, setStart] = useState("");

  return (
    <form action={createClass} className="space-y-6">
      <input type="hidden" name="first_start_iso" value={isoFromLocal(start)} />

      <section className="space-y-4 rounded-2xl border border-rule bg-surface p-5">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={labelCls}>Title</span>
            <input name="title" required maxLength={120} placeholder="e.g. Saturday Beginner Clinic" className={field} />
          </label>
          <label className="block">
            <span className={labelCls}>Sport</span>
            <select name="sport_key" defaultValue={SPORTS[0].key} className={field}>
              {SPORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.emoji} {s.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Capacity (optional)</span>
            <input name="capacity" type="number" min={1} placeholder="e.g. 8" className={field} />
          </label>
          <label className="block sm:col-span-2">
            <span className={labelCls}>Summary (optional)</span>
            <input name="summary" maxLength={160} placeholder="One line shown on the class card" className={field} />
          </label>
          <label className="block sm:col-span-2">
            <span className={labelCls}>Description (optional)</span>
            <textarea name="description" rows={4} placeholder="What to expect, who it's for, what to bring…" className={field} />
          </label>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-rule bg-surface p-5">
        <h2 className="text-sm font-bold text-ink">Format &amp; who it&rsquo;s for</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelCls}>Format</span>
            <select name="class_format" defaultValue="group_class" className={field}>
              {FORMATS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Skill level</span>
            <select name="level_label" defaultValue="all" className={field}>
              {LEVELS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Age group</span>
            <select name="age_group" defaultValue="all_ages" className={field}>
              {AGES.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Open to</span>
            <select name="gender_pref" defaultValue="all" className={field}>
              {GENDERS.map(([v, l]) => (
                <option key={v} value={v}>
                  {l}
                </option>
              ))}
            </select>
          </label>
          <label className="block sm:col-span-2">
            <span className={labelCls}>What to bring (optional)</span>
            <input name="what_to_bring" maxLength={200} placeholder="e.g. Your own paddle, water, court shoes" className={field} />
          </label>
          <label className="block sm:col-span-2">
            <span className={labelCls}>Prerequisites (optional)</span>
            <input name="prerequisites" maxLength={200} placeholder="e.g. Can rally 10+ balls; completed Beginner 1" className={field} />
          </label>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-rule bg-surface p-5">
        <h2 className="text-sm font-bold text-ink">Location</h2>
        <p className="-mt-2 text-xs text-faint">Enter the exact address — players see it on a map on the class page.</p>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelCls}>Venue name</span>
            <input name="location_name" maxLength={120} placeholder="e.g. Memorial Park Courts" className={field} />
          </label>
          <label className="block">
            <span className={labelCls}>ZIP</span>
            <input name="location_zip" inputMode="numeric" pattern="[0-9]{5}" maxLength={5} placeholder="90066" className={field} />
          </label>
          <label className="block sm:col-span-2">
            <span className={labelCls}>Exact street address</span>
            <input name="location_address" maxLength={200} placeholder="1234 Court Ave, Los Angeles, CA" className={field} />
          </label>
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-rule bg-surface p-5">
        <h2 className="text-sm font-bold text-ink">Schedule</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className={labelCls}>Type</span>
            <select
              name="recurrence"
              value={recurrence}
              onChange={(e) => setRecurrence(e.target.value as "one_off" | "recurring")}
              className={field}
            >
              <option value="one_off">One-off session</option>
              <option value="recurring">Recurring (weekly)</option>
            </select>
          </label>
          <label className="block">
            <span className={labelCls}>Duration (minutes)</span>
            <input name="duration_min" type="number" min={15} step={5} defaultValue={60} className={field} />
          </label>
          <label className="block">
            <span className={labelCls}>{recurrence === "recurring" ? "First session" : "Date & time"}</span>
            <input
              type="datetime-local"
              required
              value={start}
              onChange={(e) => setStart(e.target.value)}
              className={field}
            />
          </label>
          {recurrence === "recurring" ? (
            <label className="block">
              <span className={labelCls}># of weekly sessions</span>
              <input name="weeks" type="number" min={1} max={52} defaultValue={6} className={field} />
              <span className="mt-1 block text-[11px] text-faint">Same day & time each week.</span>
            </label>
          ) : null}
        </div>
      </section>

      <section className="space-y-4 rounded-2xl border border-rule bg-surface p-5">
        <label className="flex items-center gap-3">
          <input type="checkbox" name="paid" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="h-4 w-4 accent-brand" />
          <span className="text-sm font-semibold text-ink">This is a paid class</span>
        </label>
        {paid ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelCls}>Price (USD)</span>
              <input name="price" type="number" min={0} step="0.01" placeholder="40.00" className={field} />
            </label>
            <label className="block">
              <span className={labelCls}>Charged</span>
              <select name="price_basis" defaultValue="per_session" className={field}>
                <option value="per_session">Per session</option>
                <option value="per_series">Per series (flat)</option>
              </select>
            </label>
            <p className="text-[11px] leading-relaxed text-faint sm:col-span-2">
              Klimr doesn&rsquo;t process payments yet — you arrange collection with players and mark them paid on the roster.
            </p>
          </div>
        ) : null}
      </section>

      <section className="space-y-3 rounded-2xl border border-rule bg-surface p-5">
        <label className="block">
          <span className={labelCls}>Cancellation policy (optional)</span>
          <textarea name="cancellation_policy" rows={2} maxLength={300} placeholder="e.g. Cancel 24h ahead for a full refund; no-shows are charged." className={field} />
        </label>
      </section>

      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rule bg-surface p-5">
        <label className="flex items-center gap-3">
          <input type="checkbox" name="publish" defaultChecked className="h-4 w-4 accent-brand" />
          <span className="text-sm font-semibold text-ink">Publish now</span>
          <span className="text-xs text-faint">(uncheck to save as a draft)</span>
        </label>
        <button className="press rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep">
          Create class
        </button>
      </section>
    </form>
  );
}
