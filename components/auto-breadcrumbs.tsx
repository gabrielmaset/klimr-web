"use client";

import { usePathname } from "next/navigation";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { buildAutoTrail } from "@/lib/breadcrumb-map";

/**
 * The zero-config breadcrumb tier: mounted ONCE in the app shell, derives a
 * location trail from the pathname via the central registry, and renders the
 * same visual as hand-wired crumbs. When a page ships its own richer
 * <Breadcrumbs/> (real titles, data-driven parents), a global CSS rule hides
 * this auto trail — see globals.css `main:has(...)`. Pure render, no effects:
 * the pathname is identical on server and client, so hydration stays exact.
 */
export function AutoBreadcrumbs() {
  const pathname = usePathname();
  const items = buildAutoTrail(pathname ?? "");
  if (!items) return null;
  return (
    <div data-auto-breadcrumbs className="mx-auto w-full max-w-page px-5 pt-5 -mb-4">
      <Breadcrumbs items={items} />
    </div>
  );
}
