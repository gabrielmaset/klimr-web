"use client";

import { useState } from "react";
import { Share2, Check } from "lucide-react";

// Header "Share" control for the public tournament page. Uses the native share
// sheet when available (mobile), otherwise copies the page URL to the clipboard
// and briefly confirms.
export function ShareButton({ title, className }: { title?: string; className?: string }) {
  const [copied, setCopied] = useState(false);

  async function onShare() {
    const url = typeof window !== "undefined" ? window.location.href : "";
    const nav = typeof navigator !== "undefined" ? navigator : undefined;
    if (nav?.share) {
      try {
        await nav.share({ title: title ?? (typeof document !== "undefined" ? document.title : "Klimr"), url });
        return;
      } catch {
        // user dismissed the share sheet — fall through to copy
      }
    }
    try {
      await nav?.clipboard?.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch {
      // clipboard unavailable — nothing to do
    }
  }

  return (
    <button type="button" onClick={onShare} className={className}>
      {copied ? <Check size={15} /> : <Share2 size={15} />} {copied ? "Copied" : "Share"}
    </button>
  );
}
