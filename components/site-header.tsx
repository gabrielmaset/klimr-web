"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { KlimrLogo } from "@/components/logo";

export function SiteHeader() {
  const pathname = usePathname();
  // Code-gated portals are deliberately bare — no nav, no chrome, nothing about the product.
  if (pathname === "/gate") return null;

  // Show the opposite action so the button never points at the page you're already on:
  // "Sign up" on the login page, "Sign in" everywhere else (incl. the signup page).
  const cta = pathname === "/login" ? { href: "/signup", label: "Sign up" } : { href: "/login", label: "Sign in" };

  return (
    <header className="sticky top-0 z-40 border-b border-rule/70 bg-bg/75 backdrop-blur-xl backdrop-saturate-150">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
        <Link href="/" aria-label="Klimr home">
          <KlimrLogo />
        </Link>
        <nav className="flex items-center gap-5">
          <Link
            href={cta.href}
            className="press rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft"
          >
            {cta.label}
          </Link>
        </nav>
      </div>
    </header>
  );
}
