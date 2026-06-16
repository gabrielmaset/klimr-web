import Link from "next/link";
import { KlimrLogo } from "@/components/logo";
import { Avatar } from "@/components/avatar";
import { createClient } from "@/lib/supabase/server";
import { signOutAction } from "@/app/auth/actions";
import { AdSlot } from "@/components/ads/ad-slot";

export async function AppShell({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // The header profile icon shows the player's photo (or hue-gradient fallback)
  // on every page once they're signed in.
  let avatarUrl: string | null = null;
  let avatarHue = 200;
  let avatarName = user?.email ?? "You";
  if (user) {
    const { data: p } = await supabase
      .from("profiles")
      .select("display_name, avatar_hue, avatar_path")
      .eq("id", user.id)
      .single();
    if (p) {
      avatarHue = p.avatar_hue ?? 200;
      avatarName = p.display_name || user.email || "You";
      avatarUrl = p.avatar_path
        ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl
        : null;
    }
  }

  return (
    <div className="flex min-h-full flex-col">
      <header className="sticky top-0 z-40 border-b border-rule bg-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5">
          <Link href="/" aria-label="Klimr home" className="block">
            <KlimrLogo />
          </Link>
          <nav className="flex items-center gap-5 text-sm" aria-label="Main">
            <Link
              href="/investors"
              className="kicker hidden text-mute transition-colors hover:text-ink sm:block"
            >
              For investors
            </Link>
            {user ? (
              <div className="flex items-center gap-4">
                <Link
                  href="/account"
                  aria-label="Your account"
                  className="press flex items-center gap-2 font-semibold text-ink transition-colors hover:text-brand-deep"
                >
                  <Avatar url={avatarUrl} hue={avatarHue} name={avatarName} size={30} ring />
                  <span className="hidden sm:block">Account</span>
                </Link>
                <form action={signOutAction}>
                  <button className="press text-sm text-mute transition-colors hover:text-ink">
                    Sign out
                  </button>
                </form>
              </div>
            ) : (
              <Link
                href="/login"
                className="press rounded-full bg-ink px-4 py-2 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft"
              >
                Sign in
              </Link>
            )}
          </nav>
        </div>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="border-t border-rule bg-surface">
        <div className="mx-auto max-w-6xl px-5 py-12">
          <div className="grid gap-10 sm:grid-cols-[1.4fr_1fr_1fr]">
            <div>
              <KlimrLogo markSize={30} textClassName="text-3xl" />
              <p className="mt-2 max-w-xs text-sm leading-relaxed text-mute">
                The social network for sports players. Your game, ranked — from
                your ZIP to the world.
              </p>
            </div>
            <div>
              <div className="kicker mb-3 text-faint">Product</div>
              <ul className="space-y-2 text-sm">
                <li><Link href="/signup" className="text-mute transition-colors hover:text-ink">Sign up</Link></li>
                <li><Link href="/login" className="text-mute transition-colors hover:text-ink">Sign in</Link></li>
                <li><Link href="/account" className="text-mute transition-colors hover:text-ink">Your account</Link></li>
              </ul>
            </div>
            <div>
              <div className="kicker mb-3 text-faint">Company</div>
              <ul className="space-y-2 text-sm">
                <li><Link href="/investors" className="text-mute transition-colors hover:text-ink">For investors ↗</Link></li>
                <li>
                  <a href="mailto:hello@klimr.com" className="font-mono text-[13px] text-mute transition-colors hover:text-ink">
                    hello@klimr.com
                  </a>
                </li>
              </ul>
            </div>
          </div>
          <AdSlot className="mt-10" label="Local sponsor" />
          <p className="mt-8 text-center font-mono text-[11px] text-faint">
            © 2026 Klimr · Los Angeles · pre-launch
          </p>
        </div>
      </footer>
    </div>
  );
}
