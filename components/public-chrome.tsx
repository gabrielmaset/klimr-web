"use client";

import { usePathname } from "next/navigation";
import { SiteHeader } from "@/components/site-header";
import { SiteFooter } from "@/components/site-footer";
import { isStandalonePath } from "@/lib/nav-chrome";

/**
 * Signed-out chrome: marketing and auth pages get a slim top bar + footer;
 * standalone surfaces (the public event page) render bare. Like the signed-in
 * chrome, the decision is made client-side from usePathname so it stays correct
 * across in-app navigation rather than freezing on the surface that first
 * rendered.
 */
export function PublicChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  if (isStandalonePath(pathname)) return <>{children}</>;

  return (
    <div className="flex min-h-full flex-col">
      <SiteHeader />
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-ink focus:px-4 focus:py-2 focus:text-sm focus:font-semibold focus:text-white">Skip to content</a>
        <main id="main" className="flex-1">{children}</main>
      <SiteFooter authed={false} />
    </div>
  );
}
