import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft, ShieldCheck, BadgeDollarSign, Scale, Trophy } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SPORTS } from "@/lib/sports";
import { createTournament } from "../actions";

export const metadata: Metadata = { title: "Host a tournament" };

const ERROR_COPY: Record<string, string> = {
  agree: "Please read and accept the organizer terms below before creating your tournament.",
  invalid: "Add a tournament name and pick a sport.",
  create: "Something went wrong creating the draft. Please try again.",
};

const field =
  "w-full rounded-xl border border-rule bg-surface px-3.5 py-2.5 text-sm text-ink outline-none transition-colors focus:border-brand";
const labelCls = "mb-1.5 block text-xs font-semibold text-mute";

export default async function NewTournamentPage({ searchParams }: { searchParams: Promise<{ error?: string; code?: string; msg?: string; who?: string }> }) {
  const { error, code, msg, who } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/tournaments/new");

  const { data: prof } = await supabase.from("profiles").select("verification_status").eq("id", user.id).maybeSingle();
  const verified = prof?.verification_status === "verified";

  return (
    <div className="mx-auto max-w-page-narrow px-5 py-8 sm:py-10">
      <Link href="/tournaments" className="press mb-4 inline-flex items-center gap-1 text-sm font-semibold text-mute transition-colors hover:text-ink">
        <ArrowLeft size={16} /> Tournaments
      </Link>

      <div className="flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-tint-brand text-brand-deep">
          <Trophy size={20} />
        </span>
        <div>
          <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Host a tournament</h1>
          <p className="mt-1 text-sm text-mute">Set up a draft — you&rsquo;ll fill in the schedule, divisions, and rules before you publish.</p>
        </div>
      </div>

      {/* Pricing notice */}
      <div className="mt-6 flex items-start gap-3 rounded-2xl border border-rule bg-surface p-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f4f4f5] text-ink-soft">
          <BadgeDollarSign size={18} />
        </span>
        <div className="min-w-0 text-sm">
          <p className="font-semibold text-ink">Hosting is a paid feature — <span className="text-brand-deep">$0 during launch</span>.</p>
          <p className="mt-0.5 text-mute">
            Creating and running tournaments is free for now. We&rsquo;ll give clear notice well before any hosting fee applies, and you&rsquo;ll always be able to finish events you&rsquo;ve already started.
          </p>
        </div>
      </div>

      {!verified ? (
        <section className="mt-6 flex items-start gap-3 rounded-2xl border border-rule bg-surface p-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-tint-brand text-brand-deep">
            <ShieldCheck size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-ink">Get verified to host</h2>
            <p className="mt-0.5 text-sm text-mute">Hosting is available to verified players, so every organizer on Klimr is a real, accountable person. Verify your identity to unlock it.</p>
            <Link href="/settings/verification?need=host" className="mt-2 inline-block text-sm font-semibold text-brand-deep hover:underline">
              Verify my account →
            </Link>
          </div>
        </section>
      ) : null}

      {/* The starter form */}
      <form action={createTournament} className="mt-6 rounded-3xl border border-rule bg-surface p-5 sm:p-6">
        <h2 className="text-sm font-bold text-ink">Tournament basics</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <label className={labelCls} htmlFor="t-title">Tournament name</label>
            <input id="t-title" name="title" required maxLength={120} disabled={!verified} placeholder="e.g. Mar Vista Summer Open" className={field} />
          </div>
          <div>
            <label className={labelCls} htmlFor="t-sport">Sport</label>
            <select id="t-sport" name="sport_key" defaultValue="beach_volleyball" disabled={!verified} className={field}>
              {SPORTS.map((s) => (
                <option key={s.key} value={s.key}>{s.emoji} {s.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls} htmlFor="t-entry">Entry type</label>
            <select id="t-entry" name="entry_type" defaultValue="team" disabled={!verified} className={field}>
              <option value="team">Team</option>
              <option value="individual">Individual</option>
            </select>
          </div>
        </div>

        {/* Legal disclaimer */}
        <div className="mt-6 rounded-2xl border border-rule bg-bg/50 p-4">
          <h3 className="flex items-center gap-1.5 text-sm font-bold text-ink">
            <Scale size={15} className="text-brand-deep" /> Organizer terms &amp; legal disclaimer
          </h3>
          <p className="mt-1 text-xs text-faint">Please read before continuing. This is a summary of your responsibilities as an organizer — it isn&rsquo;t legal advice.</p>

          <div className="mt-3 max-h-72 space-y-3 overflow-y-auto rounded-xl border border-rule bg-surface p-4 text-xs leading-relaxed text-mute">
            <p><strong className="text-ink">1. Klimr is a platform, not the organizer.</strong> Klimr provides software to help you create, promote, and run your event. You — the organizer — are solely responsible for the event itself, including its planning, conduct, supervision, and outcome. Klimr is not a host, promoter, sponsor, operator, or co-organizer of any event listed on the platform, and does not endorse, vet, or guarantee any event, organizer, venue, or participant.</p>

            <p><strong className="text-ink">2. Compliance with laws.</strong> You are responsible for ensuring your event complies with all applicable federal, state, provincial, and local laws, ordinances, and regulations, including those governing public gatherings, athletic competitions, amateur and youth sport, alcohol, food service, noise, accessibility, consumer protection, prize and contest rules, and the collection of any entry fees.</p>

            <p><strong className="text-ink">3. Permits, venue rights &amp; licenses.</strong> You must obtain — and keep current — every permit, license, reservation, and written permission your event requires. This includes government and municipal permits, park or facility use agreements, the right to use any courts, fields, or premises, and any sanctioning required by a governing body. You may not list a venue you are not authorized to use.</p>

            <p><strong className="text-ink">4. Insurance.</strong> You are responsible for carrying adequate insurance for your event, including general liability coverage and any participant accident, property, or other coverage appropriate to the activity, the venue, and the number of participants. Some venues and jurisdictions require proof of insurance; obtaining it is your responsibility.</p>

            <p><strong className="text-ink">5. Participant safety &amp; waivers.</strong> You are responsible for the safety of participants, spectators, staff, and volunteers, for appropriate medical and emergency planning, and for obtaining any liability waivers, releases, and (for minors) parental or guardian consents that your event and jurisdiction require. Waiver and rules text you add in Klimr is provided by you and is your responsibility.</p>

            <p><strong className="text-ink">6. Fees, payments &amp; taxes.</strong> Any entry fees, refunds, and related disputes are between you and your participants. Klimr does not currently process payments on your behalf, and you are responsible for collecting fees, issuing any refunds, honoring your stated refund policy, and reporting and paying all applicable taxes on amounts you collect.</p>

            <p><strong className="text-ink">7. Eligibility, fair play &amp; non-discrimination.</strong> You must run your event fairly and lawfully, must not unlawfully discriminate against any participant, and are responsible for enforcing your stated eligibility, conduct, and anti-doping rules. You must comply with Klimr&rsquo;s Terms of Service and Community Guidelines at all times.</p>

            <p><strong className="text-ink">8. Data &amp; privacy.</strong> You must handle participant information lawfully, use it only to operate your event, and comply with applicable privacy laws. Do not export, sell, or repurpose participant data obtained through Klimr.</p>

            <p><strong className="text-ink">9. Intellectual property &amp; sponsorship.</strong> You are responsible for the rights to any names, logos, images, trademarks, and sponsorships used in connection with your event, and for compliance with any sponsor or governing-body obligations.</p>

            <p><strong className="text-ink">10. Indemnification.</strong> To the fullest extent permitted by law, you agree to indemnify, defend, and hold harmless Klimr and its affiliates, officers, employees, and agents from and against any claims, damages, liabilities, losses, fines, penalties, and expenses (including reasonable legal fees) arising out of or related to your event, your use of the hosting tools, or your breach of these terms.</p>

            <p><strong className="text-ink">11. No warranty; limitation of liability.</strong> The hosting tools are provided &ldquo;as is,&rdquo; without warranties of any kind. To the fullest extent permitted by law, Klimr is not liable for any injury, loss, or damage arising from any event, and Klimr&rsquo;s total liability relating to the hosting tools is limited as set out in the Klimr Terms of Service.</p>

            <p><strong className="text-ink">12. Removal &amp; enforcement.</strong> Klimr may remove, unpublish, or refuse any event or organizer, at its discretion, including for suspected illegality, safety risk, fraud, or violation of these terms or the Terms of Service.</p>

            <p className="text-faint"><strong className="text-mute">Not legal advice.</strong> This summary is provided for convenience and does not constitute legal advice. Requirements vary by location and event type. You are responsible for determining what applies to you, and we strongly recommend consulting a qualified attorney and your insurer before hosting. Your use of the hosting tools is also governed by the Klimr <Link href="/legal" className="font-semibold text-brand-deep hover:underline">Terms of Service</Link>.</p>
          </div>

          <label className="mt-3 flex items-start gap-2.5 text-sm text-ink">
            <input type="checkbox" name="agree" required disabled={!verified} className="mt-0.5 h-4 w-4 shrink-0 accent-[#ff4e1b]" />
            <span>I have read and accept the organizer terms, and I confirm I will comply with all applicable laws and hold any required insurance, permits, and licenses for my event.</span>
          </label>
        </div>

        {error && ERROR_COPY[error] ? (
          <p className="mt-3 rounded-xl bg-tint-brand px-3.5 py-2.5 text-sm text-brand-deep">
            {ERROR_COPY[error]}
            {error === "create" && code ? <span className="mt-1 block font-mono text-xs text-mute">Error code: {code}</span> : null}
            {error === "create" && msg ? <span className="mt-0.5 block font-mono text-[11px] text-faint">{msg}</span> : null}
            {error === "create" && who ? <span className="mt-1 block font-mono text-[11px] text-mute">DB identity: {who}</span> : null}
          </p>
        ) : null}

        <div className="mt-5 flex flex-wrap items-center gap-2">
          <button
            type="submit"
            disabled={!verified}
            className="press inline-flex items-center gap-1.5 rounded-full bg-brand px-6 py-2.5 text-sm font-bold text-white transition-colors hover:bg-brand-deep disabled:opacity-50"
          >
            Continue
          </button>
          <Link href="/tournaments" className="press rounded-full border border-rule px-4 py-2.5 text-sm font-semibold text-mute transition-colors hover:text-ink">
            Cancel
          </Link>
        </div>
        <p className="mt-2 text-xs text-faint">You can keep editing the draft and won&rsquo;t go live until you publish it.</p>
      </form>
    </div>
  );
}
