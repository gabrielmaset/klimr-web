"use client";

import { useRouter } from "next/navigation";
import { ChevronLeft, ArrowLeft } from "lucide-react";
import { useCanGoBack } from "@/components/navigation-history";

/**
 * Smart back button. Returns the user to wherever they actually came from
 * (browser history) when there is in-app history, so a page reachable from
 * several places goes back to the right one. When there's no in-app history
 * to pop (fresh load, deep link, new tab, external referrer), it routes to the
 * `fallback` — the page's logical parent — so "back" is never a dead end.
 */
export function BackButton({
  fallback,
  label = "Back",
  ariaLabel,
  className = "press inline-flex items-center gap-1 text-sm font-semibold text-mute transition-colors hover:text-ink",
  icon = "chevron",
  size = 16,
}: {
  fallback: string;
  label?: string;
  ariaLabel?: string;
  className?: string;
  icon?: "chevron" | "arrow";
  size?: number;
}) {
  const router = useRouter();
  const canGoBack = useCanGoBack();
  const Icon = icon === "arrow" ? ArrowLeft : ChevronLeft;

  function onClick() {
    if (canGoBack) router.back();
    else router.push(fallback);
  }

  return (
    <button type="button" onClick={onClick} aria-label={ariaLabel} className={className}>
      <Icon size={size} />
      {label ? ` ${label}` : null}
    </button>
  );
}
