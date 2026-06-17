import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowUpRight } from "lucide-react";
import { hasGate } from "@/lib/gate";

export const metadata: Metadata = { title: "For investors" };

const demoUrl = process.env.NEXT_PUBLIC_INVESTOR_DEMO_URL;

const COVERS = [
  "50+ interactive product screens",
  "Geographic rankings · ZIP to world",
  "Match integrity & verification flows",
  "Market, go-to-market, and the roadmap",
];

export default async function InvestorsPage() {
  if (!(await hasGate("investor"))) redirect("/investor-access");

  return (
    <div className="mx-auto max-w-2xl px-5 py-16">
      <p className="kicker text-brand-deep">For investors</p>
      <h1 className="mt-2 font-display text-5xl leading-[0.95] text-ink">
        See the whole <span className="italic">vision.</span>
      </h1>
      <p className="mt-4 max-w-lg text-[15px] leading-relaxed text-ink-soft">
        What you are using right now is the working MVP — live database,
        verified sign-in, the ranking engine — built pre-funding. The
        interactive investor demo shows where it goes: the full product, the
        market, and the raise.
      </p>

      <div className="mt-8 rounded-3xl border border-rule bg-surface p-6">
        <div className="kicker text-faint">The interactive demo covers</div>
        <ul className="mt-3 space-y-2">
          {COVERS.map((c) => (
            <li key={c} className="flex items-baseline gap-2.5 text-sm text-ink-soft">
              <span className="font-mono text-[11px] font-bold text-brand">→</span>
              {c}
            </li>
          ))}
        </ul>
        <div className="mt-6">
          {demoUrl ? (
            <a
              href={demoUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="press inline-flex items-center gap-2 rounded-full bg-brand px-6 py-3.5 text-[15px] font-bold text-white transition-colors hover:bg-brand-deep"
            >
              Open the interactive demo <ArrowUpRight size={17} aria-hidden />
            </a>
          ) : (
            <div className="rounded-2xl border border-dashed border-rule bg-bg p-4">
              <div className="kicker text-faint">Demo link · arriving here</div>
              <p className="mt-1.5 text-sm leading-relaxed text-mute">
                The interactive demo is being deployed. Until then, request it
                directly:
              </p>
              <a
                href="mailto:hello@klimr.com?subject=Klimr%20investor%20demo%20request"
                className="press mt-3 inline-block rounded-full bg-ink px-5 py-2.5 text-sm font-bold text-surface transition-colors hover:bg-ink-soft"
              >
                Request the demo
              </a>
            </div>
          )}
        </div>
      </div>

      <p className="mt-8 text-sm text-mute">
        Get in touch ·{" "}
        <a
          href="mailto:hello@klimr.com?subject=Klimr%20intro"
          className="font-semibold text-ink underline underline-offset-2 transition-colors hover:text-brand-deep"
        >
          hello@klimr.com
        </a>
      </p>
      <p className="mt-10">
        <Link href="/" className="text-sm text-mute transition-colors hover:text-ink">
          ← Back to Klimr
        </Link>
      </p>
    </div>
  );
}
