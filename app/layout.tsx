import type { Metadata } from "next";
import "@fontsource/instrument-serif";
import "@fontsource/instrument-serif/400-italic.css";
import "@fontsource/archivo-black";
import "@fontsource-variable/dm-sans";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import { AppShell } from "@/components/app-shell";

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
    "Per-sport rankings from your ZIP to the world. Verified players, real results. Tennis, pickleball, padel, racquetball, and golf — Los Angeles first.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}
