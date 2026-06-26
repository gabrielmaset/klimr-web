import type { NextConfig } from "next";

/**
 * Security headers. Klimr treats security as priority one, so every response
 * carries a defensive baseline. Notes:
 *  - CSP allows Supabase (auth, storage, realtime) and self-hosted assets only.
 *    'unsafe-inline' on script/style is the pragmatic Next baseline; the next
 *    hardening step is nonce-based CSP (see Klimr_Avatar_Storage.md → security).
 *  - When Google / Apple sign-in lands, add their origins to connect-src and
 *    form-action (accounts.google.com, appleid.apple.com).
 */
const csp = [
  "default-src 'self'",
  // Cloudflare Turnstile (bot/abuse protection on auth) loads a script + iframe.
  "script-src 'self' 'unsafe-inline' https://challenges.cloudflare.com",
  // Mapbox GL decodes tiles in a worker created from a blob: URL.
  "worker-src 'self' blob:",
  "child-src blob:",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co https://api.mapbox.com https://*.tiles.mapbox.com",
  "font-src 'self' data:",
  // Supabase (auth/storage/realtime) + Mapbox (styles, tiles, glyphs, telemetry) + Turnstile verify.
  "connect-src 'self' https://*.supabase.co wss://*.supabase.co https://api.mapbox.com https://*.tiles.mapbox.com https://events.mapbox.com https://challenges.cloudflare.com",
  // OpenStreetMap (legacy), Turnstile (auth), and Google Maps (venue map on public event pages).
  "frame-src https://www.openstreetmap.org https://challenges.cloudflare.com https://www.google.com https://maps.google.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "object-src 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), browsing-topics=()" },
  { key: "X-DNS-Prefetch-Control", value: "off" },
];

const nextConfig: NextConfig = {
  poweredByHeader: false, // don't advertise the framework
  experimental: {
    // Feed image uploads post through a Server Action; default cap is 1MB.
    serverActions: { bodySizeLimit: "6mb" },
  },
  images: {
    // Avatars and any future hero art served from Supabase Storage.
    remotePatterns: [{ protocol: "https", hostname: "*.supabase.co" }],
  },
  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },
};

export default nextConfig;
