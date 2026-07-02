import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { KlimrLogo } from "@/components/logo";
import { ShareButton } from "@/components/share-button";

// The public event surface is a live view of the event. Render fresh from the
// database on every request and never store fetches in the data cache, so any
// change saved anywhere in the organizer portal shows on the next refresh —
// never a cached or stale copy. Cascades to the page, signup, and confirm.
export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";
export const revalidate = 0;

/** The public event page is the event's advertisement: a standalone page with a
 *  slim, tournament-branded Klimr header and no left menu. It needs no account
 *  to view; the header funnels visitors into Sign in / Register. */
export default async function PublicEventLayout({ children, params }: { children: React.ReactNode; params: Promise<{ code: string }> }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { code } = await params;
  const registerHref = user ? `/e/${code}/signup` : `/signup?next=${encodeURIComponent(`/e/${code}/signup`)}`;

  return (
    <div className="flex min-h-dvh flex-col bg-[#F6F6F2]" style={{ fontFamily: "'Hanken Grotesk Variable', system-ui, -apple-system, sans-serif" }}>
      <header className="pt-safe px-safe border-b border-[#E7E7E1] bg-[#F6F6F2]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between gap-3 px-5 py-3 sm:px-8">
          <div className="flex items-center gap-2.5">
            <Link href="/" aria-label="Klimr home" className="press">
              <KlimrLogo />
            </Link>
            <span className="tp-mono hidden text-[11px] font-bold uppercase tracking-widest text-[#8A8D80] sm:inline">Tournament</span>
          </div>
          <div className="flex items-center gap-1 sm:gap-2">
            <ShareButton className="press inline-flex items-center gap-1.5 rounded-full px-3 py-2 text-sm font-semibold text-[#6B6E60] transition-colors hover:text-[#17190F]" />
            {user ? (
              <Link href="/feed" className="press rounded-full border border-[#E7E7E1] bg-white px-3.5 py-2 text-sm font-semibold text-[#17190F] transition-colors hover:border-[#C9C9C0]">
                Go to Klimr
              </Link>
            ) : (
              <Link href="/login" className="press rounded-full px-3 py-2 text-sm font-semibold text-[#6B6E60] transition-colors hover:text-[#17190F]">
                Sign in
              </Link>
            )}
            <Link
              href={registerHref}
              className="press inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-bold text-white"
              style={{ background: "#E4713A", boxShadow: "0 1px 2px rgba(23,25,15,.18)" }}
            >
              Register
            </Link>
          </div>
        </div>
      </header>
      <main className="flex-1">{children}</main>
    </div>
  );
}
