import { ShieldCheck } from "lucide-react";

export type SharedInfo = { name: string; email: string; gender: string };

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
  const rows = [
    { label: "Full name", value: info.name },
    { label: "Email address", value: info.email },
    { label: "Gender", value: info.gender },
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
