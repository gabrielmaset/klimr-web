import { ShieldCheck } from "lucide-react";

export type SharedInfo = { name: string; email: string; gender: string };

/**
 * Single source of truth for *which* Klimr account fields are disclosed to a
 * tournament organizer. Both the sign-up "Shared with the organizer" card and
 * the team-invite disclaimer read from this list, so updating it here updates
 * the wording everywhere.
 */
export const SHARED_FIELD_LABELS = ["Full name", "Email address", "Gender"] as const;

function humanizeList(items: readonly string[]): string {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}

export function genderLabel(value: string | null | undefined): string {
  switch (value) {
    case "woman":
      return "Woman";
    case "man":
      return "Man";
    case "nonbinary":
      return "Non-binary";
    default:
      return "Prefer not to say";
  }
}

/**
 * Up-front transparency box shown at the top of the sign-up form: tells the
 * registrant exactly which Klimr account details are shared with the event
 * organizer. `extra` rows let an event disclose anything else it requires.
 */
export function RegistrantSharedInfo({ info, extra }: { info: SharedInfo; extra?: { label: string; value: string }[] }) {
  const values = [info.name, info.email, info.gender];
  const rows = [
    ...SHARED_FIELD_LABELS.map((label, i) => ({ label, value: values[i] })),
    ...(extra ?? []),
  ];
  return (
    <section className="rounded-2xl border border-rule bg-bg/40 p-4 sm:p-5">
      <div className="flex items-start gap-2.5">
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-tint-brand text-brand-deep">
          <ShieldCheck size={15} />
        </span>
        <div className="min-w-0">
          <h2 className="text-sm font-bold text-ink">Shared with the organizer</h2>
          <p className="mt-0.5 text-xs text-mute">From your Klimr account, the organizer of this event receives:</p>
        </div>
      </div>
      <dl className="mt-3 divide-y divide-rule/60 overflow-hidden rounded-xl border border-rule bg-surface">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between gap-3 px-3.5 py-2.5">
            <dt className="shrink-0 text-xs font-medium text-mute">{r.label}</dt>
            <dd className="min-w-0 truncate text-right text-sm font-semibold text-ink">{r.value}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-3 text-[11px] leading-relaxed text-faint">Update these anytime in your Klimr profile. Your answers to the questions below are shared with the organizer too.</p>
    </section>
  );
}

/**
 * Compact disclaimer shown when a player accepts an invitation to join a team.
 * Teams can be entered into tournaments, at which point the same account fields
 * above are shared with that event's organizer — so we disclose that up front.
 * Reads SHARED_FIELD_LABELS, so it stays in sync with the sign-up card.
 */
export function TeamSharingDisclaimer({ className = "" }: { className?: string }) {
  const list = humanizeList(SHARED_FIELD_LABELS.map((l) => l.toLowerCase()));
  return (
    <div className={`flex items-start gap-2 rounded-xl border border-rule bg-bg/50 px-3.5 py-2.5 ${className}`}>
      <ShieldCheck size={14} className="mt-0.5 shrink-0 text-brand-deep" aria-hidden />
      <p className="text-[11px] leading-relaxed text-mute">
        Heads up: if this team is entered in a tournament, that event&rsquo;s organizer receives your Klimr account details — <span className="font-medium text-ink-soft">{list}</span> — along with any answers you give to the event&rsquo;s questions. You can update these anytime in your Klimr profile.
      </p>
    </div>
  );
}
