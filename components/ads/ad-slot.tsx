import { cn } from "@/lib/utils";

/**
 * Reserved ad slot. Renders an empty, clearly-labelled placeholder so the
 * space is designed-in from day one. Later it accepts a local-sponsor card or
 * an ad unit, per the ads-first monetization decision — no revenue code in v1.
 */
export function AdSlot({
  label = "Sponsor",
  className,
}: {
  label?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-rule bg-bg px-4 py-5 text-center",
        className,
      )}
    >
      <div className="kicker text-faint">{label} · reserved</div>
      <div className="mt-1 text-xs text-mute">
        A local sponsor card lands here at launch
      </div>
    </div>
  );
}
