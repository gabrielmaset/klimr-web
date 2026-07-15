"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Megaphone } from "lucide-react";

type Props = {
  title: string;
  sportName: string;
  sportEmoji: string;
  kindLabel: string;
  startsAt: string;
  endsAt?: string | null;
  where: string | null;
  costText: string | null;
  capacity: number | null;
  description: string | null;
  url: string;
  whereLocked?: boolean;
};

type Platform = "whatsapp" | "instagram" | "x" | "sms";
const PLATFORMS: { key: Platform; label: string }[] = [
  { key: "whatsapp", label: "WhatsApp" },
  { key: "instagram", label: "Instagram" },
  { key: "x", label: "X / Threads" },
  { key: "sms", label: "Text / SMS" },
];

function fmtWhen(startsAt: string, endsAt?: string | null): { day: string; time: string } {
  const s = new Date(startsAt);
  const day = s.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  let time = s.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  if (endsAt) time += `–${new Date(endsAt).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" })}`;
  return { day, time };
}

/** Platform-native promo text. WhatsApp gets *bold* markers and airy line
 *  breaks; Instagram gets a caption with hashtags; X gets the 280-char cut;
 *  SMS gets one tight line. The Klimr link rides every format. */
function compose(p: Platform, d: Props): string {
  const { day, time } = fmtWhen(d.startsAt, d.endsAt);
  const cost = d.costText?.trim() || "Free";
  const spots = d.capacity != null ? `${d.capacity} spots` : null;
  const blurb = d.description?.trim().split("\n")[0]?.slice(0, 140) ?? "";

  if (p === "whatsapp") {
    return [
      `${d.sportEmoji} *${d.title.toUpperCase()}*`,
      ``,
      blurb || `A ${d.kindLabel.toLowerCase()} for the ${d.sportName.toLowerCase()} crew — come through.`,
      ``,
      `📅 *${day}*`,
      `🕘 ${time}`,
      d.where ? `📍 ${d.where}` : d.whereLocked ? `📍 Location shared once you RSVP` : null,
      `🎟️ ${cost}${spots ? ` · ${spots}` : ""}`,
      ``,
      `RSVP on Klimr so we know you're in:`,
      d.url,
      ``,
      `See you out there! ${d.sportEmoji}`,
    ]
      .filter((l): l is string => l !== null)
      .join("\n");
  }
  if (p === "instagram") {
    const tag = d.sportName.replace(/[^a-z]/gi, "").toLowerCase();
    return [
      `${d.sportEmoji} ${d.title} ${d.sportEmoji}`,
      ``,
      blurb || `Movement, community, and ${d.sportName.toLowerCase()} — pull up.`,
      ``,
      `📅 ${day} · ${time}`,
      d.where ? `📍 ${d.where}` : d.whereLocked ? `📍 Location shared once you RSVP` : null,
      `🎟️ ${cost}`,
      ``,
      `RSVP link: ${d.url}`,
      ``,
      `#${tag} #klimr #${(d.where ?? "losangeles").replace(/[^a-z]/gi, "").toLowerCase()} #pickupsports`,
    ]
      .filter((l): l is string => l !== null)
      .join("\n");
  }
  if (p === "x") {
    const core = `${d.sportEmoji} ${d.title} — ${day}, ${time}${d.where ? ` @ ${d.where}` : ""}. ${cost}. RSVP: `;
    return core.slice(0, 280 - 24) + d.url;
  }
  return `${d.sportEmoji} ${d.title} · ${day} ${time}${d.where ? ` · ${d.where}` : ""} · ${cost} · RSVP: ${d.url}`;
}

export function EventShareKit(props: Props) {
  const [platform, setPlatform] = useState<Platform>("whatsapp");
  const [copied, setCopied] = useState(false);
  const text = useMemo(() => compose(platform, props), [platform, props]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* older browsers: select-all fallback below */
    }
  }

  return (
    <section className="rounded-2xl border border-rule bg-surface p-4 shadow-e1 sm:p-5">
      <div className="flex items-center gap-2">
        <Megaphone size={16} className="text-brand-deep" aria-hidden />
        <h2 className="text-[15px] font-bold text-ink">Spread the word</h2>
      </div>
      <p className="mt-1 text-[13px] text-mute">Ready-to-paste promo for your group chats and socials — the RSVP link rides along.</p>

      <div className="mt-3 flex flex-wrap gap-1.5" role="tablist" aria-label="Format">
        {PLATFORMS.map((p) => (
          <button
            key={p.key}
            type="button"
            role="tab"
            aria-selected={platform === p.key}
            onClick={() => {
              setPlatform(p.key);
              setCopied(false);
            }}
            className={`press rounded-full border px-3 py-1.5 text-[13px] font-bold transition-colors ${platform === p.key ? "border-ink bg-ink text-pop" : "border-rule bg-surface text-mute hover:text-ink"}`}
          >
            {p.label}
          </button>
        ))}
      </div>

      <pre className="mt-3 max-h-64 overflow-y-auto whitespace-pre-wrap rounded-xl border border-rule-soft bg-bg px-3.5 py-3 font-sans text-[13.5px] leading-relaxed text-ink-soft">{text}</pre>

      <button
        type="button"
        onClick={() => void copy()}
        className={`press mt-3 inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[14px] font-bold transition-colors ${copied ? "bg-[#217A34] text-white" : "bg-ink text-pop hover:bg-ink-soft"}`}
      >
        {copied ? <Check size={15} strokeWidth={3} /> : <Copy size={15} />} {copied ? "Copied — paste away" : "Copy for " + PLATFORMS.find((p) => p.key === platform)?.label}
      </button>
    </section>
  );
}
