"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";
import { savePreferences } from "./actions";

export type Prefs = {
  notif_match_invites: boolean;
  notif_ranking_changes: boolean;
  notif_region_challenges: boolean;
  notif_marketplace_events: boolean;
  email_digest: string;
  profile_visibility: string;
  location_precision: string;
  who_can_invite: string;
};

function Toggle({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      aria-pressed={on}
      className="press flex w-full items-center justify-between gap-4 py-3 text-left"
    >
      <span>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-mute">{hint}</span> : null}
      </span>
      <span
        className="relative h-6 w-10 shrink-0 rounded-full transition-colors"
        style={{ background: on ? "#ff4e1b" : "#e4e4e7" }}
      >
        <span
          className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all"
          style={{ left: on ? "1.25rem" : "0.125rem" }}
        />
      </span>
    </button>
  );
}

function Segmented({
  label,
  hint,
  value,
  onChange,
  options,
}: {
  label: string;
  hint?: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div className="py-3">
      <div className="mb-2">
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-mute">{hint}</span> : null}
      </div>
      <div className="inline-flex flex-wrap gap-1 rounded-xl border border-rule bg-[#f4f4f5] p-1">
        {options.map((o) => {
          const on = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={on}
              className="press rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors"
              style={{ background: on ? "#ffffff" : "transparent", color: on ? "#0a0a0b" : "#71717a", boxShadow: on ? "0 1px 2px rgba(10,10,11,0.12)" : "none" }}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function SettingsForm({ initial }: { initial: Prefs }) {
  const [state, action, pending] = useActionState(savePreferences, undefined);
  const [p, setP] = useState<Prefs>(initial);
  const set = <K extends keyof Prefs>(k: K, v: Prefs[K]) => setP((prev) => ({ ...prev, [k]: v }));

  return (
    <form action={action}>
      {/* Notifications */}
      <section className="rounded-2xl border border-rule bg-surface p-4 sm:p-5">
        <h2 className="kicker text-faint">Notifications</h2>
        <p className="mt-1 text-xs text-mute">Choose what you hear about. Delivery turns on as each feature ships.</p>
        <div className="mt-2 divide-y divide-rule">
          <Toggle label="Match invites" hint="When someone invites you to play" on={p.notif_match_invites} onChange={(v) => set("notif_match_invites", v)} />
          <Toggle label="Ranking changes" hint="When your rank moves in any area" on={p.notif_ranking_changes} onChange={(v) => set("notif_ranking_changes", v)} />
          <Toggle label="Region challenges" hint="Neighborhood-vs-neighborhood events" on={p.notif_region_challenges} onChange={(v) => set("notif_region_challenges", v)} />
          <Toggle label="Marketplace & events" hint="Local coaching, gear, and tournaments" on={p.notif_marketplace_events} onChange={(v) => set("notif_marketplace_events", v)} />
          <Segmented
            label="Email digest"
            hint="A periodic summary by email"
            value={p.email_digest}
            onChange={(v) => set("email_digest", v)}
            options={[
              { value: "none", label: "Off" },
              { value: "daily", label: "Daily" },
              { value: "weekly", label: "Weekly" },
            ]}
          />
        </div>
      </section>

      {/* Privacy */}
      <section className="mt-4 rounded-2xl border border-rule bg-surface p-4 sm:p-5">
        <h2 className="kicker text-faint">Privacy</h2>
        <div className="mt-2 divide-y divide-rule">
          <Segmented
            label="Profile visibility"
            hint="Who can view your full profile"
            value={p.profile_visibility}
            onChange={(v) => set("profile_visibility", v)}
            options={[
              { value: "members", label: "Members only" },
              { value: "public", label: "Public" },
            ]}
          />
          <Segmented
            label="Location precision"
            hint="How precisely your area is shown to others"
            value={p.location_precision}
            onChange={(v) => set("location_precision", v)}
            options={[
              { value: "city", label: "City" },
              { value: "neighborhood", label: "Neighborhood" },
              { value: "zip", label: "ZIP" },
            ]}
          />
          <Segmented
            label="Who can invite me"
            hint="Limit who can send you match invites"
            value={p.who_can_invite}
            onChange={(v) => set("who_can_invite", v)}
            options={[
              { value: "anyone", label: "Anyone" },
              { value: "verified", label: "Verified only" },
              { value: "nobody", label: "No one" },
            ]}
          />
        </div>
      </section>

      {/* hidden inputs carry the controlled state into the action */}
      <input type="hidden" name="notif_match_invites" value={String(p.notif_match_invites)} />
      <input type="hidden" name="notif_ranking_changes" value={String(p.notif_ranking_changes)} />
      <input type="hidden" name="notif_region_challenges" value={String(p.notif_region_challenges)} />
      <input type="hidden" name="notif_marketplace_events" value={String(p.notif_marketplace_events)} />
      <input type="hidden" name="email_digest" value={p.email_digest} />
      <input type="hidden" name="profile_visibility" value={p.profile_visibility} />
      <input type="hidden" name="location_precision" value={p.location_precision} />
      <input type="hidden" name="who_can_invite" value={p.who_can_invite} />

      <div className="mt-4 flex items-center gap-3">
        <button
          type="submit"
          disabled={pending}
          className="press rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft disabled:opacity-50"
        >
          {pending ? "Saving…" : "Save changes"}
        </button>
        {state?.ok ? (
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-success">
            <Check size={15} /> Saved
          </span>
        ) : null}
        {state?.error ? <span className="text-sm text-brand-deep">{state.error}</span> : null}
      </div>
    </form>
  );
}
