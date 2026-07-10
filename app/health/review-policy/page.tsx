import type { Metadata } from "next";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";

export const metadata: Metadata = { title: "How we review content — Klimr" };

export default function ReviewPolicyPage() {
  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:py-10">
      <Link href="/health" className="press inline-flex items-center gap-1.5 text-sm text-mute transition-colors hover:text-ink">
        <ArrowLeft size={15} /> Health &amp; Nutrition
      </Link>
      <h1 className="mt-5 font-display text-[32px] font-bold leading-tight text-ink">How we review content</h1>
      <div className="mt-4 grid gap-4 text-[14.5px] leading-relaxed text-ink-soft">
        <p>
          Every piece in The Training Table is written for healthy, recreational athletes and follows published guidance
          from recognized bodies — the NIH, CDC, ACSM, the Academy of Nutrition and Dietetics, and the certifying
          organizations behind the credentials we verify. Each read lists its sources at the bottom, and carries the date
          it was last reviewed or updated.
        </p>
        <p>
          <strong className="text-ink">Named professional review.</strong> As Klimr&rsquo;s verified professional network grows, every
          piece is assigned to a named, credentialed reviewer in the relevant specialty — a registered dietitian for
          fueling and hydration, a physical therapist or athletic trainer for injury topics, a mental-performance
          consultant for the mental game. Reviewed pieces show the reviewer&rsquo;s name and credentials; until a piece has a
          named reviewer, it shows its cited bodies instead — we never invent a reviewer.
        </p>
        <p>
          <strong className="text-ink">Freshness.</strong> Content older than roughly two years is re-reviewed before it can resurface in
          &ldquo;Most read.&rdquo; Corrections update the piece in place and refresh its date.
        </p>
        <p>
          <strong className="text-ink">What this content is not.</strong> Nothing in the library is medical, dietetic, or mental-health
          advice, a diagnosis, or a treatment plan. For anything personal — injuries, conditions, medications,
          individual nutrition — work with a <Link href="/health" className="font-semibold text-brand-deep hover:underline">verified professional</Link> or your own clinician.
        </p>
      </div>
    </div>
  );
}
