import { cn } from "@/lib/utils";
import { AdSenseUnit } from "./adsense-unit";

// Set in Vercel to go live, e.g. "ca-pub-1234567890123456".
const ADSENSE_CLIENT = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;

/**
 * Reserved ad slot. Until AdSense is configured (NEXT_PUBLIC_ADSENSE_CLIENT in
 * the environment + a `slot` id passed here), it renders a clean, clearly
 * labelled placeholder so the space is designed-in from day one. Set the env
 * var and pass `slot` and the same spot serves a live AdSense unit — no markup
 * changes anywhere it's used. Per the ads-first monetization decision.
 */
export function AdSlot({
  label = "Sponsor",
  slot,
  className,
}: {
  label?: string;
  slot?: string;
  className?: string;
}) {
  const live = Boolean(ADSENSE_CLIENT && slot);

  if (live) {
    return (
      <div className={cn("overflow-hidden rounded-2xl", className)}>
        <AdSenseUnit client={ADSENSE_CLIENT as string} slot={slot as string} />
      </div>
    );
  }

  return (
    <div
      className={cn(
        "rounded-2xl border border-dashed border-rule bg-bg px-4 py-5 text-center",
        className,
      )}
      aria-hidden
    >
      <div className="kicker text-faint">{label} · reserved</div>
      <div className="mt-1 text-xs text-mute">A local sponsor card lands here at launch</div>
    </div>
  );
}
