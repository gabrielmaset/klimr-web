import type { Metadata } from "next";
import Link from "next/link";
import { LifeBuoy, ChevronRight } from "lucide-react";

export const metadata: Metadata = { title: "Help center" };

const SECTIONS: { h: string; items: { q: string; a: string }[] }[] = [
  {
    h: "Getting started",
    items: [
      { q: "What is Klimr?", a: "Klimr is an invite-only, identity-verified social network for racquet sports — tennis, pickleball, padel, and racquetball. You build a real profile, get ranked locally, find matches and players near you, and join teams. Every member is a verified person, so rankings and matches reflect real play." },
      { q: "How do invite codes work?", a: "During the beta, joining requires a valid invite code. Enter it on the sign-up screen with your email. Each code has a limited number of uses. If your code is full or invalid, write hello@klimr.com." },
      { q: "How do I sign in?", a: "Klimr uses a magic link — there is no password. Enter your email, open the link we send, and you will be signed in after a quick two-factor check. The link is single-use and short-lived." },
    ],
  },
  {
    h: "Verification & rankings",
    items: [
      { q: "What does “verified” mean?", a: "A verified player has confirmed their identity. Because everyone on Klimr is verified, the people you see, match, and compete against are real — which is what keeps the leaderboards honest." },
      { q: "How do ranking points work?", a: "Only verified matches count toward your ranking. A match verifies when both players confirm the result and Klimr confirms you were at the same court. Until then points are held as pending. If a match can’t be verified — no confirmation, or your locations don’t match — the points don’t count. No rank without actually playing." },
      { q: "What are the geographic levels?", a: "You’re ranked per sport at every level of geography: your ZIP, then neighborhood, city, state, national, and world. Rankings start at your home ZIP, so your local board fills in first." },
    ],
  },
  {
    h: "Matches & play",
    items: [
      { q: "How do I find a match?", a: "Open Play lists open matches near you that still need players. Filter by sport, see who’s organizing and how many spots are left, and tap any match to request a spot. You can also organize your own and let verified players nearby fill it." },
      { q: "What is “Matches need a player”?", a: "It’s a quick way to jump into a game without organizing one — a shortlist of open matches with spots still open, surfaced on Discover. Tap through to request a spot." },
      { q: "Can I schedule recurring games?", a: "Yes — when organizing a match you can mark it as repeating weekly, every two weeks, or monthly." },
    ],
  },
  {
    h: "Teams",
    items: [
      { q: "How do teams work?", a: "A verified player creates a team and becomes its owner. Teams are organized like a real club, with roles — owner, manager, staff, and members (including captains, co-captains, and subs). Only verified players can join, so the same identity guarantee that protects matches extends to every roster." },
      { q: "How do I add players to my team?", a: "You add players you’re connected with. Because connections are mutual and require approval, this prevents random or unwanted team invites." },
    ],
  },
  {
    h: "Courts",
    items: [
      { q: "Where does court information come from?", a: "Klimr keeps a catalog of places to play, built from a public directory and from courts players add. Court reviews come only from verified players who checked in and played there — real signal, no drive-by complaints." },
    ],
  },
  {
    h: "Safety & account",
    items: [
      { q: "How do I block or report someone?", a: "You can block a player from their profile — blocking hides them from your feed and stops them from inviting you. To report behavior, use Contact support or the report option, and our team will review it." },
      { q: "How do I download or delete my data?", a: "From Settings → Data & account you can download a JSON copy of your profile, sports, posts, and settings, or delete your account. See our Privacy policy for how your data is handled." },
    ],
  },
];

export default function HelpPage() {
  return (
    <div className="mx-auto max-w-page-narrow px-5 py-10 sm:py-14">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-tint-brand text-brand-deep">
          <LifeBuoy size={20} />
        </span>
        <div>
          <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Help center</h1>
          <p className="mt-1 text-sm text-mute">Answers to common questions about Klimr.</p>
        </div>
      </div>

      <div className="mt-8 space-y-8">
        {SECTIONS.map((s) => (
          <section key={s.h}>
            <h2 className="kicker mb-3 text-brand-deep">{s.h}</h2>
            <div className="divide-y divide-rule rounded-2xl border border-rule bg-surface">
              {s.items.map((it) => (
                <div key={it.q} className="p-4 sm:p-5">
                  <h3 className="text-sm font-bold text-ink">{it.q}</h3>
                  <p className="mt-1.5 text-sm leading-relaxed text-mute">{it.a}</p>
                </div>
              ))}
            </div>
          </section>
        ))}
      </div>

      <div className="mt-10 rounded-2xl border border-rule bg-surface p-5">
        <h2 className="text-sm font-bold text-ink">Still need help?</h2>
        <p className="mt-1 text-sm text-mute">We read every message. Most are answered within a couple of business days.</p>
        <Link href="/support" className="press mt-3 inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft">
          Contact support <ChevronRight size={16} />
        </Link>
      </div>

      <div className="mt-6 flex flex-wrap gap-x-5 gap-y-1 text-xs text-faint">
        <Link href="/guidelines" className="hover:text-ink">Community guidelines</Link>
        <Link href="/legal" className="hover:text-ink">Terms &amp; privacy</Link>
      </div>
    </div>
  );
}
