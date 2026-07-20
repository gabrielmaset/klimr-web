import type { Metadata } from "next";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ShieldCheck, ExternalLink } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { articleBySlug, topicLabel, FEATURED_COLLECTION } from "@/lib/health-content";

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const a = articleBySlug.get(slug);
  return { title: a ? `${a.title} — Klimr` : "The Training Table — Klimr" };
}

export default async function HealthReadPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const article = articleBySlug.get(slug);
  if (!article) notFound();

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/health/read/${slug}`);

  // Real read tracking — set-based increment, no PII.
  await supabase.rpc("bump_article_read", { p_slug: slug });

  const inCollection = FEATURED_COLLECTION.slugs.includes(slug);
  const idx = FEATURED_COLLECTION.slugs.indexOf(slug);
  const nextSlug = inCollection && idx < FEATURED_COLLECTION.slugs.length - 1 ? FEATURED_COLLECTION.slugs[idx + 1] : null;
  const nextArticle = nextSlug ? articleBySlug.get(nextSlug) : null;

  return (
    <div className="mx-auto max-w-3xl px-5 py-8 sm:py-10">

      <article className="mt-5">
        <p className="font-mono text-[10px] font-bold uppercase tracking-[.18em] text-flame-text">
          {topicLabel.get(article.topic)} · {article.minutes} min read
        </p>
        <h1 className="mt-1.5 font-display text-[32px] font-bold leading-tight tracking-[-0.02em] text-ink">{article.title}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{article.dek}</p>

        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1 border-y border-rule py-2.5 text-xs">
          <span className="flex items-center gap-1.5 text-ink-soft">
            <ShieldCheck size={13} className="text-success" />
            {article.reviewedBy ? `Reviewed by ${article.reviewedBy.name}, ${article.reviewedBy.credentials}` : "Named professional review pending"}
          </span>
          <span className="font-mono text-[10px] uppercase text-faint">
            Updated {new Date(article.reviewedAt + "T12:00:00Z").toLocaleDateString("en-US", { month: "long", year: "numeric" })}
          </span>
        </div>

        <div className="mt-5 grid gap-5">
          {article.sections.map((s) => (
            <section key={s.h}>
              <h2 className="text-[17px] font-bold text-ink">{s.h}</h2>
              <p className="mt-1.5 text-[14.5px] leading-relaxed text-ink-soft">{s.body}</p>
            </section>
          ))}
        </div>

        <div className="mt-7 rounded-2xl border border-rule bg-bg p-4">
          <p className="font-mono text-[9.5px] font-bold uppercase tracking-[.18em] text-faint">Sources</p>
          <ul className="mt-1.5 grid gap-1">
            {article.sources.map((s) => (
              <li key={s.url}>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 text-[13px] font-semibold text-brand-deep hover:underline">
                  {s.label} <ExternalLink size={12} />
                </a>
              </li>
            ))}
          </ul>
        </div>

        {nextArticle ? (
          <Link href={`/health/read/${nextArticle.slug}`} className="press mt-5 flex items-center justify-between rounded-2xl border border-[#FFD9C2] bg-tint-brand p-4 transition-all hover:-translate-y-0.5">
            <span>
              <span className="block font-mono text-[9px] font-bold uppercase tracking-[.18em] text-flame-text">Next in {FEATURED_COLLECTION.title}</span>
              <span className="mt-0.5 block text-sm font-bold text-ink">{nextArticle.title}</span>
            </span>
            <span className="text-brand-deep">→</span>
          </Link>
        ) : null}

        <p className="mt-6 text-[11.5px] leading-relaxed text-faint">
          General education, not medical or dietetic advice — for anything personal, work with a <Link href="/health" className="underline hover:text-ink">verified professional</Link> or your own clinician. If something feels seriously wrong, stop playing and seek medical care.
        </p>
      </article>
    </div>
  );
}
