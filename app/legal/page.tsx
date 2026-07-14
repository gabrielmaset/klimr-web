import type { Metadata } from "next";
import Link from "next/link";
import { FileText } from "lucide-react";

export const metadata: Metadata = { title: "Terms & privacy" };

export default function LegalPage() {
  return (
    <div className="mx-auto max-w-page-narrow px-5 py-10 sm:py-14">
      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-tint-brand text-brand-deep">
          <FileText size={20} />
        </span>
        <div>
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.2em] text-flame-text">Klimr — Legal</p>
        <h1 className="mt-1.5 font-display text-[40px] font-bold leading-none tracking-[-0.025em] text-ink">Terms &amp; privacy</h1>
          <p className="mt-1 text-sm text-mute">Last updated July 14, 2026 · Klimr beta</p>
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
        <Block title="5. Assumption of risk & release">
          <span className="font-semibold">PLEASE READ THIS SECTION CAREFULLY — IT AFFECTS YOUR LEGAL RIGHTS.</span> Sports and physical
          activity carry inherent risks, including serious injury. Klimr is a platform that helps members find players, matches, courts,
          events, and professionals; we do not organize, supervise, control, or guarantee any match, event, session, or interaction, and we
          are not a party to them. You voluntarily assume all risks arising from your participation and your interactions with other members,
          whether online or in person. To the maximum extent permitted by law, you release Klimr and its founders, employees, and agents from
          any and all claims, demands, and damages arising out of or connected with member interactions, matches, events, sessions, or venue
          conditions. If you are a California resident, you waive California Civil Code §1542, which says: &ldquo;A general release does not
          extend to claims that the creditor or releasing party does not know or suspect to exist in his or her favor at the time of executing
          the release and that, if known by him or her, would have materially affected his or her settlement with the debtor or released
          party.&rdquo; Use good judgment: meet in public places and play within your ability.
        </Block>
        <Block title="6. Interactions between members; no background checks">
          Identity verification confirms name and age signals at sign-up — it is <span className="font-semibold">not</span> a background
          check, and we do not conduct criminal-history screening on members. You are solely responsible for your interactions with other
          members. Klimr has no obligation to become involved in disputes between members, though we may review reports and take action under
          our <InlineLink href="/guidelines">Community guidelines</InlineLink>.
        </Block>
        <Block title="7. Professionals, classes & health content">
          Coaches, trainers, and health professionals on Klimr are independent providers — not employees or agents of Klimr. We verify
          submitted credentials against issuing bodies at the time of review, but verification is point-in-time and not a guarantee of
          quality, licensure status, or fitness for your needs; confirm anything material directly with the provider. Sessions and payments
          are arranged directly between you and the provider, and Klimr is not a party to those transactions.
          <span className="font-semibold"> Content in Klimr&rsquo;s health and training library is for general information only and is not
          medical advice</span>; consult a qualified professional before acting on it.
        </Block>
        <Block title="8. Marketplace & payments">
          Marketplace listings are offered by members, and transactions are solely between buyer and seller; Klimr does not own, inspect, or
          warrant listed items and is not a party to member-to-member sales. Some future features (such as bookings) may involve payments
          processed by third parties; any such terms will be presented at the time of purchase. The current beta does not charge for core
          features.
        </Block>
        <Block title="9. Intellectual property & DMCA">
          Klimr, the Klimr mark, and the service&rsquo;s design, software, and content (excluding member content) are owned by Klimr and
          protected by law; we grant you a limited, revocable, non-transferable license to use the service as intended. If you believe
          content on Klimr infringes your copyright, send a notice under the Digital Millennium Copyright Act to hello@klimr.com with the
          identification of the work, the location of the material, your contact information, a good-faith statement, and your signature. We
          respond to valid notices and terminate repeat infringers. If you send us feedback or suggestions, we may use them without
          restriction or compensation.
        </Block>
        <Block title="10. Termination">
          You can stop using Klimr and delete your account at any time from Settings. We may suspend or terminate accounts that violate these
          Terms or our guidelines, or to protect the community. Identity verification means a removed person cannot simply create a new
          account. Sections that by their nature should survive termination (including releases, disclaimers, liability limits, indemnity,
          and dispute resolution) survive.
        </Block>
        <Block title="11. Disclaimers">
          KLIMR IS PROVIDED &ldquo;AS IS&rdquo; AND &ldquo;AS AVAILABLE,&rdquo; WITHOUT WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING
          IMPLIED WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. We do not warrant that rankings,
          reviews, listings, credentials, or member-provided information are accurate or reliable, or that the service will be uninterrupted,
          secure, or error-free. Some jurisdictions do not allow certain warranty exclusions, so parts of this section may not apply to you.
        </Block>
        <Block title="12. Limitation of liability">
          TO THE MAXIMUM EXTENT PERMITTED BY LAW, KLIMR WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, EXEMPLARY, OR
          PUNITIVE DAMAGES, OR FOR LOST PROFITS, DATA, GOODWILL, OR PERSONAL INJURY ARISING FROM MEMBER INTERACTIONS, EVEN IF ADVISED OF THE
          POSSIBILITY. OUR TOTAL AGGREGATE LIABILITY FOR ALL CLAIMS RELATING TO THE SERVICE IS LIMITED TO THE GREATER OF ONE HUNDRED U.S.
          DOLLARS (US $100) OR THE AMOUNTS YOU PAID KLIMR IN THE TWELVE MONTHS BEFORE THE CLAIM. Some jurisdictions do not allow certain
          limitations, so parts of this section may not apply to you.
        </Block>
        <Block title="13. Indemnification">
          You agree to indemnify and hold harmless Klimr and its founders, employees, and agents from claims, damages, and expenses
          (including reasonable attorneys&rsquo; fees) arising from your content, your use of the service, your interactions with other
          members or providers, or your violation of these Terms or of law.
        </Block>
        <Block title="14. Dispute resolution — binding arbitration & class waiver">
          <span className="font-semibold">PLEASE READ — THIS AFFECTS HOW DISPUTES ARE RESOLVED.</span> Before filing a claim, you and Klimr
          agree to try to resolve any dispute informally: write to hello@klimr.com with a description of the dispute, and allow 30 days for
          good-faith discussion. If unresolved, you and Klimr agree that any dispute arising out of these Terms or the service will be
          resolved by <span className="font-semibold">binding individual arbitration</span> administered by the American Arbitration
          Association under its Consumer Arbitration Rules, rather than in court, except that (a) either party may bring qualifying claims in
          small-claims court, and (b) either party may seek injunctive relief in court for infringement or misuse of intellectual property.
          Arbitration will take place in your county of residence or remotely (by phone, video, or written submissions).
          <span className="font-semibold"> YOU AND KLIMR EACH WAIVE THE RIGHT TO A JURY TRIAL AND TO PARTICIPATE IN A CLASS ACTION;</span>
          claims may be brought only in an individual capacity. You may opt out of this arbitration agreement by emailing hello@klimr.com
          within 30 days of first accepting these Terms, stating your name and that you opt out. Except where prohibited, any claim must be
          filed within one year of when it accrued. Nothing in this section prevents you from seeking public injunctive relief where that
          right cannot lawfully be waived.
        </Block>
        <Block title="15. Governing law & general">
          These Terms are governed by the laws of the State of California, without regard to conflict-of-law rules. If any provision is found
          unenforceable, the rest remains in effect. Our failure to enforce a provision is not a waiver. You may not assign these Terms; we
          may assign them in connection with a merger, acquisition, or sale of assets. These Terms, together with the
          <InlineLink href="/guidelines"> Community guidelines</InlineLink> and this page&rsquo;s Privacy Policy, are the entire agreement
          between you and Klimr regarding the service. We are not liable for delays or failures caused by events beyond our reasonable
          control.
        </Block>
        <Block title="16. Changes">
          We may update these Terms as Klimr evolves. We&rsquo;ll update the date above and, for material changes, give prominent notice in
          the app and may ask you to re-accept. Continued use after changes take effect means you accept them.
        </Block>
        <Block title="17. Contact">
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
            confidential and stored encrypted. <span className="font-semibold">We never sell or share your personal information</span>, and we do not share this
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
          We do not sell your personal information, and we do not “share” it as that term is defined under the California Consumer Privacy Act (i.e., for cross-context behavioral advertising). We disclose data only to service providers who help us run Klimr (such as hosting and email delivery) under confidentiality obligations, or when required by law to protect safety and rights. Aggregated or de-identified statistics may be used to improve the product.
        </Block>
        <Block title="Retention">
          We keep personal information for as long as your account is active. When you delete your account, we delete or de-identify your
          personal information within a reasonable period, except where limited retention is required for legal compliance, dispute
          resolution, fraud and abuse prevention, or safety (for example, records tied to enforcement actions), after which it is deleted.
        </Block>
        <Block title="Cookies & tracking">
          Klimr uses only cookies that are necessary to run the service — signing you in, keeping your session secure, and remembering
          preferences. We do not use third-party advertising cookies, cross-site tracking pixels, or session-replay recording tools, and we do
          not engage in cross-context behavioral advertising.
        </Block>
        <Block title="Security">
          We use industry-standard safeguards, including encryption in transit and at rest for sensitive fields, access controls, and verification protections. No system is perfectly secure, but we work to protect your information and limit who can access it.
        </Block>
        <Block title="Your choices & rights">
          You can edit most information in your account, control notifications in Settings, block players, and download a copy of your data
          or delete your account at any time. Depending on where you live (including under the California Consumer Privacy Act), you may have
          the right to know what personal information we hold about you, to access it in a portable format, to correct it, to delete it, to
          opt out of sale or sharing (Klimr does not sell or share personal information, so there is nothing to opt out of), to limit the use
          of sensitive personal information (we use it only to provide the service), and not to be discriminated against for exercising these
          rights. Exercise these rights in Settings (export and delete are self-serve) or by writing hello@klimr.com; we will verify requests
          using your account email and respond within the time required by law. An authorized agent may submit a request on your behalf with
          proof of authorization. Because we do not sell or share personal information or use cross-site tracking, opt-out preference signals
          such as Global Privacy Control have nothing to opt out of on Klimr.
        </Block>
        <Block title="International visitors">
          Klimr is operated from the United States and intended for members in the U.S. during the beta. If you access Klimr from elsewhere,
          you understand your information is processed in the U.S. under this policy.
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
