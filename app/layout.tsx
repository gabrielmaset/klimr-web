import type { Metadata, Viewport } from "next";
import "@fontsource-variable/inter";
import "@fontsource-variable/inter/standard-italic.css";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/oswald";
import "@fontsource-variable/fraunces/full.css"; // logotype only — see components/logo.tsx
import "./globals.css";
import Script from "next/script";
import { AppShell } from "@/components/app-shell";
import { NavigationHistoryProvider } from "@/components/navigation-history";
import { DiagnosticsInit } from "@/components/diagnostics-init";

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL;

export const metadata: Metadata = {
  ...(siteUrl ? { metadataBase: new URL(siteUrl) } : {}),
  // DEV GATE: keeps search engines away while Klimr is in private beta.
  // Remove this `robots` block at public launch so the site can be indexed.
  robots: { index: false, follow: false },
  title: {
    default: "Klimr — your game, ranked",
    template: "%s · Klimr",
  },
  description:
    "Per-sport rankings from your ZIP to the world. Verified players, real results. Tennis, pickleball, padel, and racquetball — Los Angeles first.",
};

// viewport-fit=cover lets the layout extend under the notch / Dynamic Island /
// home indicator so we can pad precisely with env(safe-area-inset-*) — the same
// technique native and PWA apps use to look right on every phone. Zoom stays
// enabled (no maximum-scale) for accessibility.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ffffff",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const adsenseClient = process.env.NEXT_PUBLIC_ADSENSE_CLIENT;
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <DiagnosticsInit />
        <NavigationHistoryProvider>
          <AppShell>{children}</AppShell>
        </NavigationHistoryProvider>
        {adsenseClient ? (
          <Script
            id="adsense-loader"
            async
            strategy="afterInteractive"
            crossOrigin="anonymous"
            src={`https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${adsenseClient}`}
          />
        ) : null}
      </body>
    </html>
  );
}
