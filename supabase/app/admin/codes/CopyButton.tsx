"use client";

import { useState } from "react";
import { Copy, Check } from "lucide-react";

export function CopyButton({ value, label = "Copy code" }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <button
      type="button"
      onClick={copy}
      aria-label={label}
      title={copied ? "Copied" : "Copy"}
      className="press grid h-6 w-6 shrink-0 place-items-center rounded-md border border-rule text-mute transition-colors hover:text-ink"
    >
      {copied ? <Check size={12} /> : <Copy size={12} />}
    </button>
  );
}
