"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KlimrLogo } from "@/components/logo";
import { AdSlot } from "@/components/ads/ad-slot";

export function SiteFooter({ authed = false }: { authed?: boolean }) {
  // Klimr is built primarily for players. The investor link lives only at the
  // bottom of the main (landing) page.
  const pathname = usePathname();
  // Full-screen chat threads own the viewport — no footer there (matches the nav bars).
  if (pathname.startsWith("/chats/")) return null;
  // Code-gated portals are deliberately bare — logo + code only, nothing about the product.
  if (pathname === "/gate") return null;
  const isHome = pathname === "/";

  return (
    <footer className="border-t border-rule bg-surface">
      <div className="mx-auto max-w-6xl px-5 py-12">
        <div className="grid gap-10 sm:grid-cols-[1.4fr_1fr_1fr]">
          <div>
            <KlimrLogo markSize={30} textClassName="text-3xl" />
            <p className="mt-2 max-w-xs text-sm leading-relaxed text-mute">
              The social network for sports players. Your game, ranked — from your ZIP to the world.
            </p>
          </div>
          <div>
            <div className="kicker mb-3 text-faint">Product</div>
            <ul className="space-y-2 text-sm">
              {authed ? (
                <>
                  <li><Link href="/feed" className="text-mute transition-colors hover:text-ink">Feed</Link></li>
                  <li><Link href="/account" className="text-mute transition-colors hover:text-ink">Your account</Link></li>
                  <li><Link href="/settings" className="text-mute transition-colors hover:text-ink">Settings</Link></li>
                </>
              ) : (
                <>
                  <li><Link href="/signup" className="text-mute transition-colors hover:text-ink">Sign up</Link></li>
                  <li><Link href="/login" className="text-mute transition-colors hover:text-ink">Sign in</Link></li>
                  <li><Link href="/account" className="text-mute transition-colors hover:text-ink">Your account</Link></li>
                </>
              )}
            </ul>
          </div>
          <div>
            <div className="kicker mb-3 text-faint">Company</div>
            <ul className="space-y-2 text-sm">
              {isHome ? (
                <li><a href="https://vision.klimr.com" target="_blank" rel="noopener noreferrer" className="text-mute transition-colors hover:text-ink">For investors ↗</a></li>
              ) : null}
              <li>
                <a href="mailto:hello@klimr.com" className="font-mono text-[13px] text-mute transition-colors hover:text-ink">
                  hello@klimr.com
                </a>
              </li>
            </ul>
          </div>
        </div>
        <AdSlot className="mt-10" label="Local sponsor" />
        <p className="mt-8 text-center font-mono text-[11px] text-faint">© 2026 Klimr · Los Angeles · pre-launch</p>
      </div>
    </footer>
  );
}
