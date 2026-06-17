"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KlimrLogo } from "@/components/logo";

export function SiteHeader() {
  const pathname = usePathname();
  // Code-gated portals are deliberately bare — no nav, no chrome, nothing about the product.
  if (pathname === "/gate" || pathname === "/investor-access") return null;

  return (
    <header className="sticky top-0 z-40 border-b border-rule/70 bg-bg/75 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
        <Link href="/" aria-label="Klimr home">
          <KlimrLogo />
        </Link>
        <nav className="flex items-center gap-5">
          <Link
            href="/login"
            className="press rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft"
          >
            Sign in
          </Link>
        </nav>
      </div>
    </header>
  );
}
