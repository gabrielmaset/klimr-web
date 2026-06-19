import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";

export const metadata: Metadata = { title: "Terms & privacy" };

export default function LegalPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-10 sm:py-14">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-tint-brand text-brand-deep">
          <FileText size={20} />
        </span>
        <div>
          <h1 className="font-display text-4xl leading-none text-ink sm:text-5xl">Terms &amp; privacy</h1>
          <p className="mt-1 text-sm text-mute">Last updated June 2026 · Klimr beta</p>
        </div>
      </div>

      {/* quick nav */}
      <div className="mt-6 flex flex-wrap gap-2 text-xs">
        <a href="#terms" className="rounded-full border border-rule px-3 py-1.5 font-semibold text-ink hover:bg-bg">Terms of Service</a>
        <a href="#privacy" className="rounded-full border border-rule px-3 py-1.5 font-semibold text-ink hover:bg-bg">Privacy Policy</a>
      </div>

      {/* TERMS */}
      <section id="terms" className="mt-10 scroll-mt-20">
        <h2 className="font-display text-3xl text-ink">Terms of Service</h2>
        <p className="mt-3 text-sm leading-relaxed text-mute">
          These Terms govern your use of Klimr. By creating an account or using Klimr, you agree to them. If you do not agree, do not use Klimr.
        </p>

        <Block title="1. Eligibility & accounts">
          Klimr is invite-only and limited to people aged 18 or older during the beta. You must provide accurate information, including your real name and date of birth, and complete identity verification. You are responsible for activity on your account. One account per person; don’t share, sell, or transfer your account.
        </Block>
        <Block title="2. Acceptable use">
          You agree to follow our <InlineLink href="/guidelines">Community guidelines</InlineLink>. Don’t misuse Klimr — no fraud, harassment, impersonation, manipulation of rankings or reviews, scraping, reverse engineering, spam, or illegal activity. We may remove content or accounts that violate these Terms or our guidelines.
        </Block>
        <Block title="3. Your content">
          You keep ownership of what you post (your profile, posts, reviews, messages). You grant Klimr a non-exclusive, worldwide license to host, display, and use that content to operate and improve the service. You’re responsible for what you post and confirm you have the right to post it.
        </Block>
        <Block title="4. Rankings, matches & reviews">
          Rankings, match verification, and court reviews depend on accurate, good-faith participation. We may withhold, adjust, or remove points, results, or reviews that we determine are inaccurate, unverified, or manipulated. Rankings are provided as-is and for community use.
        </Block>
        <Block title="5. Safety disclaimer">
          Klimr helps you find players, matches, and courts, but we don’t organize, supervise, or guarantee any match or interaction. You meet and play with others at your own risk. Use good judgment and meet in public places.
        </Block>
        <Block title="6. Payments">
          Some future features (such as coaching bookings or marketplace purchases) may involve payments. Any such terms will be presented at the time of purchase. The current beta does not charge for core features.
        </Block>
        <Block title="7. Termination">
          You can stop using Klimr and delete your account at any time from Settings. We may suspend or terminate accounts that violate these Terms or our guidelines, or to protect the community. Identity verification means a removed person cannot simply create a new account.
        </Block>
        <Block title="8. Disclaimers & liability">
          Klimr is provided “as is,” without warranties of any kind. To the maximum extent permitted by law, Klimr is not liable for indirect, incidental, or consequential damages arising from your use of the service.
        </Block>
        <Block title="9. Changes">
          We may update these Terms as Klimr evolves. We’ll update the date above and, for material changes, give notice in the app. Continued use after changes means you accept them.
        </Block>
        <Block title="10. Contact">
          Questions about these Terms? <InlineLink href="/support">Contact support</InlineLink> or write hello@klimr.com.
        </Block>
      </section>

      {/* PRIVACY */}
      <section id="privacy" className="mt-12 scroll-mt-20">
        <h2 className="font-display text-3xl text-ink">Privacy Policy</h2>
        <p className="mt-3 text-sm leading-relaxed text-mute">
          Your trust matters. This policy explains what we collect, how we use it, and the choices you have.
        </p>

        <div className="mt-4 rounded-2xl border border-brand/30 bg-tint-brand/40 p-4">
          <p className="text-sm font-semibold text-ink">Our promise on sensitive information</p>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">
            Information you give us to verify your identity — your full name and date of birth — and your home ZIP code is kept
            confidential and stored encrypted. <span className="font-semibold">We never sell your personal information</span>, and we do not share this
            sensitive data with other members. We use your year of birth only to display your age, and your ZIP only to anchor your local rankings and find play near you.
          </p>
        </div>

        <Block title="Information we collect">
          Account &amp; identity: your name, email, date of birth, and verification details. Profile: the sports you play, skill levels, bio, photo, gender (optional), and availability. Activity: matches, results, rankings, posts, reviews, teams, and messages. Location: your home ZIP and, where relevant, the courts you play at. Technical: device and usage information needed to run and secure the service.
        </Block>
        <Block title="How we use it">
          To create your verified profile and rankings; to find matches, players, and courts near you; to operate teams, reviews, and the feed; to keep Klimr safe and prevent fraud; and to communicate with you (you control notification and email-digest preferences in Settings).
        </Block>
        <Block title="What’s shown to others">
          Your first name, photo, sports, skill levels, area (neighborhood/city), rankings, and age are visible to other members. Your full legal name, exact date of birth, email, and ZIP are not shown to other members. Gender is never shown without your say.
        </Block>
        <Block title="How we share">
          We don’t sell your personal information. We share data only with service providers who help us run Klimr (such as hosting and email delivery) under confidentiality obligations, or when required by law to protect safety and rights. Aggregated or de-identified statistics may be used to improve the product.
        </Block>
        <Block title="Security">
          We use industry-standard safeguards, including encryption in transit and at rest for sensitive fields, access controls, and verification protections. No system is perfectly secure, but we work to protect your information and limit who can access it.
        </Block>
        <Block title="Your choices & rights">
          You can edit most information in your account, control notifications in Settings, block players, and download a copy of your data or delete your account at any time. Deleting your account removes your profile and associated personal data, subject to limited retention required for legal or safety reasons.
        </Block>
        <Block title="Children">
          Klimr is for adults 18 and older during the beta and is not directed to children. We don’t knowingly collect information from anyone under 18.
        </Block>
        <Block title="Changes & contact">
          We’ll update this policy as needed and revise the date above. Questions or requests about your data? <InlineLink href="/support">Contact support</InlineLink> or write hello@klimr.com.
        </Block>
      </section>

      <div className="mt-12 flex flex-wrap gap-x-5 gap-y-1 text-xs text-faint">
        <Link href="/help" className="hover:text-ink">Help center</Link>
        <Link href="/guidelines" className="hover:text-ink">Community guidelines</Link>
        <Link href="/support" className="hover:text-ink">Contact support</Link>
      </div>
    </div>
  );
}

function Block({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <h3 className="text-sm font-bold text-ink">{title}</h3>
      <p className="mt-1.5 text-sm leading-relaxed text-mute">{children}</p>
    </div>
  );
}

function InlineLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="font-semibold text-brand-deep underline underline-offset-2 hover:text-brand">
      {children}
    </Link>
  );
}
