"use client";

import { useEffect, useState } from "react";
import { Copy, Check, Share2, Link2 } from "lucide-react";

export function InviteShare({ code }: { code: string }) {
  const [client, setClient] = useState<{ origin: string; canShare: boolean }>({ origin: "", canShare: false });
  const [copied, setCopied] = useState<"link" | "code" | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setClient({ origin: window.location.origin, canShare: typeof navigator !== "undefined" && !!navigator.share });
  }, []);

  const origin = client.origin;
  const canShare = client.canShare;

  const link = origin ? `${origin}/signup?code=${code}` : `/signup?code=${code}`;
  const shareText = `Join me on Klimr — verified players and local rankings for racquet sports. Use my invite code ${code}:`;

  const copy = async (what: "link" | "code") => {
    try {
      await navigator.clipboard.writeText(what === "link" ? link : code);
      setCopied(what);
      setTimeout(() => setCopied(null), 1600);
    } catch {
      // clipboard may be unavailable; the value is visible to copy manually
    }
  };

  const share = async () => {
    try {
      await navigator.share({ title: "Klimr invite", text: shareText, url: link });
    } catch {
      // user dismissed or share unsupported
    }
  };

  return (
    <div className="space-y-3">
      {/* the code */}
      <div className="rounded-2xl border border-rule bg-surface shadow-e1 p-4">
        <p className="kicker text-faint">Your invite code</p>
        <div className="mt-1.5 flex items-center justify-between gap-3">
          <span className="font-mono text-2xl font-bold tracking-[0.12em] text-ink">{code}</span>
          <button
            onClick={() => copy("code")}
            className="press inline-flex shrink-0 items-center gap-1.5 rounded-full border border-rule px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-bg"
          >
            {copied === "code" ? <Check size={14} className="text-success" /> : <Copy size={14} />}
            {copied === "code" ? "Copied" : "Copy"}
          </button>
        </div>
      </div>

      {/* the link */}
      <div className="rounded-2xl border border-rule bg-surface shadow-e1 p-4">
        <p className="kicker text-faint">Shareable link</p>
        <div className="mt-1.5 flex items-center gap-2">
          <Link2 size={15} className="shrink-0 text-mute" />
          <span className="min-w-0 flex-1 truncate font-mono text-xs text-ink-soft">{link}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-2">
          <button
            onClick={() => copy("link")}
            className="press inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft"
          >
            {copied === "link" ? <Check size={15} /> : <Copy size={15} />}
            {copied === "link" ? "Link copied" : "Copy link"}
          </button>
          {canShare ? (
            <button
              onClick={share}
              className="press inline-flex items-center gap-1.5 rounded-full border border-rule px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-bg"
            >
              <Share2 size={15} /> Share
            </button>
          ) : null}
          <a
            href={`mailto:?subject=${encodeURIComponent("Join me on Klimr")}&body=${encodeURIComponent(`${shareText}\n\n${link}`)}`}
            className="press inline-flex items-center gap-1.5 rounded-full border border-rule px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-bg"
          >
            Email it
          </a>
        </div>
      </div>
    </div>
  );
}
