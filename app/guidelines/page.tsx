import type { Metadata } from "next";
import Link from "next/link";
import { ShieldCheck } from "lucide-react";

export const metadata: Metadata = { title: "Community guidelines" };

const RULES: { h: string; body: string[] }[] = [
  {
    h: "1. Be a real, verified person",
    body: [
      "Klimr is identity-verified. Use your real identity, one account per person, and keep your profile accurate. Impersonation, fake accounts, and shared logins undermine the trust the whole network depends on and will be removed.",
    ],
  },
  {
    h: "2. Play fair and report honestly",
    body: [
      "Rankings only mean something if results are real. Report scores truthfully, confirm matches you actually played, and don’t manipulate outcomes, collude to inflate ratings, or create matches that didn’t happen.",
      "A match only counts when both players confirm and your locations match. Don’t try to work around that.",
    ],
  },
  {
    h: "3. Treat people with respect",
    body: [
      "Harassment, hate speech, threats, bullying, and discrimination based on race, ethnicity, national origin, religion, disability, age, sex, gender identity, or sexual orientation are not allowed — on your profile, in the feed, in messages, or at a match.",
      "Disagreements happen. Keep them civil. Repeated hostility is grounds for removal.",
    ],
  },
  {
    h: "4. Keep it safe",
    body: [
      "Meet for matches in public, and use good judgment. Don’t solicit minors, share sexual or graphic content, promote self-harm, or organize anything illegal. Klimr is an 18+ community during the beta.",
      "Don’t share another person’s private information without their consent.",
    ],
  },
  {
    h: "5. Respect teams and courts",
    body: [
      "Only invite people you’re connected with to your team, and manage rosters in good faith. Court reviews are for players who actually checked in and played — no fake reviews, no settling scores, no reviews of places you haven’t played.",
    ],
  },
  {
    h: "6. No spam or misuse",
    body: [
      "Don’t spam invites, posts, or messages; don’t scrape the platform; and don’t use Klimr to advertise unrelated products or run scams. Sponsored listings and partnerships go through Klimr.",
    ],
  },
  {
    h: "How we enforce",
    body: [
      "We review reports and act on violations with steps that fit the situation — a warning, content removal, loss of verified status, temporary suspension, or permanent removal for serious or repeated harm. Identity verification means a removed person can’t simply make a new account.",
      "If you see something that breaks these guidelines, report it from the player’s profile or through Contact support. You can also block any player to stop them from contacting you.",
    ],
  },
];

export default function GuidelinesPage() {
  return (
    <div className="mx-auto max-w-page-narrow px-5 py-10 sm:py-14">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-tint-brand text-brand-deep">
          <ShieldCheck size={20} />
        </span>
        <div>
          <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Community guidelines</h1>
          <p className="mt-1 text-sm text-mute">What it means to be part of Klimr.</p>
        </div>
      </div>

      <p className="mt-8 text-sm leading-relaxed text-ink-soft">
        Klimr works because the people on it are real and play fair. These guidelines apply everywhere on Klimr —
        your profile, the feed, messages, matches, teams, and reviews. By using Klimr you agree to follow them.
      </p>

      <div className="mt-8 space-y-7">
        {RULES.map((r) => (
          <section key={r.h}>
            <h2 className="font-display text-xl text-ink">{r.h}</h2>
            {r.body.map((p, i) => (
              <p key={i} className="mt-2 text-sm leading-relaxed text-mute">{p}</p>
            ))}
          </section>
        ))}
      </div>

      <div className="mt-10 flex flex-wrap gap-x-5 gap-y-1 text-xs text-faint">
        <Link href="/help" className="hover:text-ink">Help center</Link>
        <Link href="/legal" className="hover:text-ink">Terms &amp; privacy</Link>
        <Link href="/support" className="hover:text-ink">Contact support</Link>
      </div>
    </div>
  );
}
