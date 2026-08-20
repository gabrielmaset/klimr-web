"use client";

import { useActionState, useState } from "react";
import { Check } from "lucide-react";
import { saveTeamNotificationPrefs } from "@/app/settings/actions";

export type TeamPrefs = {
  notif_team_invites: boolean;
  notif_team_roster: boolean;
  notif_team_activity: boolean;
};

function Toggle({ label, hint, on, onChange }: { label: string; hint?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!on)} aria-pressed={on} className="press flex w-full items-center justify-between gap-4 py-3 text-left">
      <span>
        <span className="block text-sm font-semibold text-ink">{label}</span>
        {hint ? <span className="mt-0.5 block text-xs text-mute">{hint}</span> : null}
      </span>
      <span className="relative h-6 w-10 shrink-0 rounded-full transition-colors" style={{ background: on ? "var(--color-brand)" : "var(--color-rule)" }}>
        <span className="absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all" style={{ left: on ? "1.25rem" : "0.125rem" }} />
      </span>
    </button>
  );
}

export function TeamNotificationsForm({ initial }: { initial: TeamPrefs }) {
  const [state, action, pending] = useActionState(saveTeamNotificationPrefs, undefined);
  const [p, setP] = useState<TeamPrefs>(initial);
  const set = <K extends keyof TeamPrefs>(k: K, v: TeamPrefs[K]) => setP((prev) => ({ ...prev, [k]: v }));

  return (
    <form action={action} className="rounded-2xl border border-rule bg-surface shadow-e1">
      <div className="p-4 sm:p-5">
        <h2 className="kicker text-faint">Team notifications</h2>
        <p className="mt-1 text-xs text-mute">What you hear about from the teams you&rsquo;re on. Safety and account notices always deliver.</p>
        <div className="mt-2 divide-y divide-rule">
          <Toggle label="Team invites" hint="When a captain invites you to join a team" on={p.notif_team_invites} onChange={(v) => set("notif_team_invites", v)} />
          <Toggle label="Rosters, entries & substitutions" hint="Tournament entries, roster changes, and substitution requests for your teams" on={p.notif_team_roster} onChange={(v) => set("notif_team_roster", v)} />
          <Toggle label="Team activity" hint="Posts and updates from teams you're on" on={p.notif_team_activity} onChange={(v) => set("notif_team_activity", v)} />
        </div>
      </div>
      <input type="hidden" name="notif_team_invites" value={String(p.notif_team_invites)} />
      <input type="hidden" name="notif_team_roster" value={String(p.notif_team_roster)} />
      <input type="hidden" name="notif_team_activity" value={String(p.notif_team_activity)} />
      <div className="flex items-center gap-3 border-t border-rule p-4 sm:p-5">
        <button type="submit" disabled={pending} className="press rounded-[10px] bg-ink px-5 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft disabled:opacity-50">
          {pending ? "Saving…" : "Save changes"}
        </button>
        {state?.ok ? (
          <span className="inline-flex items-center gap-1 text-sm font-semibold text-success"><Check size={15} /> Saved</span>
        ) : null}
        {state?.error ? <span className="text-sm text-brand-deep">{state.error}</span> : null}
      </div>
    </form>
  );
}
