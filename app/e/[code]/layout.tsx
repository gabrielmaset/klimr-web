import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { KlimrLogo } from "@/components/logo";
import { publicBgHex, type TournamentFormatConfig } from "@/lib/tournament";

// The public event surface is a live view of the event. Render fresh from the
// database on every request and never store fetches in the data cache, so any
// change saved anywhere in the organizer portal shows on the next refresh —
// never a cached or stale copy. Cascades to the page, signup, and confirm.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

/** The public event page is the event's advertisement: a standalone page with a
 *  slim Klimr header and no left menu. It needs no account to view; the header
 *  funnels logged-out visitors into Sign in / Join so they can register. */
export default async function PublicEventLayout({ children, params }: { children: React.ReactNode; params: Promise<{ code: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Background colour is the organiser's choice (Settings → Public page background).
  // Read fresh each request — force-dynamic above — so a change shows on one refresh.
  const { code } = await params;
  const { data: t } = await supabase.from("tournaments").select("format_config").eq("code", code).maybeSingle();
  const bg = publicBgHex((t?.format_config as TournamentFormatConfig | null)?.public_bg);

  return (
    <div className="flex min-h-dvh flex-col" style={{ backgroundColor: bg }}>
      <header className="sticky top-0 z-30 border-b border-rule/70 bg-white/70 backdrop-blur-xl backdrop-saturate-150">
        <div className="mx-auto flex max-w-page items-center justify-between gap-3 px-5 py-3">
          <Link href="/" aria-label="Klimr home" className="press">
            <KlimrLogo />
          </Link>
          {user ? (
            <Link
              href="/feed"
              className="press inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-faint"
            >
              Go to Klimr
            </Link>
          ) : (
            <div className="flex items-center gap-2">
              <Link href="/login" className="press rounded-full px-3 py-2 text-sm font-semibold text-mute transition-colors hover:text-ink">
                Sign in
              </Link>
              <Link href="/signup" className="press rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-deep">
                Join Klimr
              </Link>
            </div>
          )}
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
