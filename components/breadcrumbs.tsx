import Link from "next/link";
import { ChevronRight } from "lucide-react";

/**
 * Location breadcrumbs — the professional pattern (NN/g, Google, and what
 * Amazon/GitHub/Stripe actually ship): crumbs show where a page LIVES in the
 * site's structure, not the click path (the Back button owns history; path
 * crumbs break on refresh, deep links, and sharing). Pages with multiple
 * conceivable parents resolve them from DATA — a queue belongs to its event,
 * so its trail reads Events > {Event} > Live queue no matter how you arrived.
 *
 * Renders only at depth ≥ 2: top-level pages carry no lonely self-label.
 * Emits schema.org BreadcrumbList for search.
 */
export type Crumb = { label: string; href?: string };

export function Breadcrumbs({ items }: { items: Crumb[] }) {
  if (!items || items.length < 2) return null;
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((c, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: c.label,
      ...(c.href ? { item: `https://klimr.com${c.href}` } : {}),
    })),
  };
  return (
    <nav aria-label="Breadcrumb" className="mb-3">
      <ol className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        {items.map((c, i) => {
          const last = i === items.length - 1;
          return (
            <li key={`${c.label}-${i}`} className="flex min-w-0 items-center gap-x-1.5">
              {i > 0 ? <ChevronRight size={13} className="shrink-0 text-faint" aria-hidden /> : null}
              {c.href && !last ? (
                <Link
                  href={c.href}
                  className="max-w-[15rem] truncate text-sm font-semibold text-mute transition-colors hover:text-ink"
                >
                  {c.label}
                </Link>
              ) : (
                <span
                  aria-current={last ? "page" : undefined}
                  className={`max-w-[17rem] truncate text-sm font-semibold ${last ? "text-ink" : "text-mute"}`}
                >
                  {c.label}
                </span>
              )}
            </li>
          );
        })}
      </ol>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </nav>
  );
}
