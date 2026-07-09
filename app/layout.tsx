import type { Metadata, Viewport } from "next";
import "@fontsource-variable/space-grotesk";
import "@fontsource-variable/instrument-sans";
import "@fontsource-variable/instrument-sans/standard-italic.css";
import "@fontsource-variable/jetbrains-mono";
import "@fontsource-variable/hanken-grotesk";
import "@fontsource/space-mono/400.css";
import "@fontsource/space-mono/700.css";
import "@fontsource-variable/fraunces/full.css"; // logotype only — see components/logo.tsx
import "./globals.css";
import Script from "next/script";
import { AppShell } from "@/components/app-shell";
import { NavigationHistoryProvider } from "@/components/navigation-history";
import { DiagnosticsInit } from "@/components/diagnostics-init";
import { ErrorReporter } from "@/components/error-reporter";

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
        <ErrorReporter />
        <svg
          viewBox="0 0 1600 800"
          preserveAspectRatio="xMidYMin slice"
          aria-hidden="true"
          className="pointer-events-none fixed inset-0 hidden h-full w-full md:block"
          style={{ opacity: 0.03 }}
        >
          <path d="M-100,240 C300,140 620,340 900,220 S1400,120 1700,260" fill="none" stroke="#201B12" strokeWidth="1" />
          <path d="M-100,340 C300,240 620,440 900,320 S1400,220 1700,360" fill="none" stroke="#201B12" strokeWidth="1" />
          <path d="M-100,440 C300,340 620,540 900,420 S1400,320 1700,460" fill="none" stroke="#201B12" strokeWidth="1" />
          <path d="M-100,540 C300,440 620,640 900,520 S1400,420 1700,560" fill="none" stroke="#201B12" strokeWidth="1" />
        </svg>
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
