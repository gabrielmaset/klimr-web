import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { HeartPulse, BadgeCheck, ShieldCheck, Star, X, BookOpen, Binoculars, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PROFESSIONAL_ROLES } from "@/lib/professional-roles";
import { HEALTH_TOPICS, HEALTH_ARTICLES, FEATURED_COLLECTION, QUICK_ANSWERS, topicLabel, articleBySlug, LONGEST_TOPIC_CH } from "@/lib/health-content";
import { ProControls } from "@/components/health/pro-controls";
import { LibraryControls } from "@/components/health/library-controls";
import { QuickAnswers } from "@/components/health/quick-answers";
import { ProviderReviews, Stars, type ReviewItem } from "@/components/provider-reviews";
import { messagePro, reportProvider } from "@/app/health/actions";

export const metadata: Metadata = { title: "Health & Nutrition — Klimr" };

/* ── specialty identity system (handoff §1) ─────────────────────────── */
const SPECIALTIES = [
  { key: "dietitian", label: "Dietitians", one: "Dietitian", bg: "#F1F8E3", bd: "#DCEBC0", fg: "#4D7C0F", roles: ["dietitian"] },
  { key: "pt", label: "Physical therapists", one: "Physical therapist", bg: "#EAF1FE", bd: "#CDDEFA", fg: "#1D4ED8", roles: ["physical_therapist"] },
  { key: "atc", label: "Athletic trainers", one: "Athletic trainer", bg: "#FEF0E4", bd: "#F9DAC0", fg: "#C2410C", roles: ["athletic_trainer"] },
  { key: "massage", label: "Massage", one: "Sports massage", bg: "#FDEDF4", bd: "#F7D2E2", fg: "#BE185D", roles: ["massage_therapist"] },
  { key: "mental", label: "Mental performance", one: "Mental performance", bg: "#F3EFFE", bd: "#E2D8FA", fg: "#6D28D9", roles: ["mental_performance"] },
] as const;
const roleToSpec = new Map<string, (typeof SPECIALTIES)[number]>();
for (const s of SPECIALTIES) for (const r of s.roles) roleToSpec.set(r, s);
const HEALTH_KEYS = new Set(PROFESSIONAL_ROLES.filter((r) => r.category === "health").map((r) => r.key));

type Pro = {
  userId: string;
  name: string;
  hue: number;
  avatarUrl: string | null;
  credentials: string;
  specs: (typeof SPECIALTIES)[number][];
  bio: string | null;
  headline: string | null;
  format: string;
  areaText: string | null;
  priceFrom: number | null;
  availability: string;
  nextOpening: string | null;
  sports: string[];
  rating: number | null;
  reviewCount: number;
  memberSince: number | null;
  verifiedCreds: { title: string; registry: string; verifiedAt: string | null }[];
  reviews: ReviewItem[];
};

const CRED_ABBR: Record<string, string> = {
  dietitian: "RD/RDN",
  physical_therapist: "PT",
  athletic_trainer: "ATC",
  massage_therapist: "CMT",
  mental_performance: "CMPC",
};
const mono = "font-mono";
const sp = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) ?? "";

export default async function HealthPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const raw = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/health");

  const fFormat = sp(raw.format); // '', 'inperson', 'virtual'
  const fSpec = sp(raw.spec);
  const fQ = sp(raw.q).toLowerCase();
  const fSort = sp(raw.sort) || "top";
  const fTopic = sp(raw.topic);
  const lQ = sp(raw.lq).toLowerCase();
  const lSort = sp(raw.lsort) || "new";
  const page = Math.max(1, parseInt(sp(raw.page) || "1", 10) || 1);
  const openProId = sp(raw.pro);
  const notice = sp(raw.notice);

  /* ── providers: approved, unexpired, health-category ─────────────── */
  const { data: provRows } = await supabase
    .from("class_providers")
    .select("user_id, roles, headline, bio, rating_avg, rating_count, approved_at, format, price_from_cents, availability, next_opening, area_text, sports")
    .eq("status", "approved")
    .or(`credential_expires_at.is.null,credential_expires_at.gt.${new Date().toISOString()}`);
  const healthRows = (provRows ?? []).filter((p) => (p.roles ?? []).some((r) => HEALTH_KEYS.has(r)));
  const ids = healthRows.map((p) => p.user_id);

  const ident = new Map<string, { name: string; hue: number; avatarUrl: string | null }>();
  const reviewsBy = new Map<string, ReviewItem[]>();
  const credsBy = new Map<string, Pro["verifiedCreds"]>();
  if (ids.length) {
    const [{ data: profiles }, { data: reviews }, { data: apps }] = await Promise.all([
      supabase.from("profiles").select("id, display_name, avatar_hue, avatar_path").in("id", ids),
      supabase.from("provider_reviews").select("id, provider_user_id, reviewer_id, rating, body, created_at").in("provider_user_id", ids).order("created_at", { ascending: false }).limit(500),
      supabase.from("provider_applications").select("user_id, role, credential_type, credential_id, reviewed_at").in("user_id", ids).eq("status", "approved"),
    ]);
    for (const p of profiles ?? []) {
      ident.set(p.id, {
        name: p.display_name ?? "Professional",
        hue: p.avatar_hue ?? 200,
        avatarUrl: p.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null,
      });
    }
    const reviewerIds = [...new Set((reviews ?? []).map((r) => r.reviewer_id))];
    const rName = new Map<string, string>();
    if (reviewerIds.length) {
      const { data: rn } = await supabase.from("profiles").select("id, display_name").in("id", reviewerIds);
      for (const x of rn ?? []) rName.set(x.id, x.display_name ?? "Member");
    }
    for (const r of reviews ?? []) {
      if (!reviewsBy.has(r.provider_user_id)) reviewsBy.set(r.provider_user_id, []);
      reviewsBy.get(r.provider_user_id)!.push({ id: r.id, reviewerId: r.reviewer_id, reviewerName: rName.get(r.reviewer_id) ?? "Member", rating: r.rating, body: r.body, createdAt: r.created_at });
    }
    for (const a of apps ?? []) {
      if (!HEALTH_KEYS.has(a.role) && !roleToSpec.has(a.role)) continue;
      const meta = PROFESSIONAL_ROLES.find((x) => x.key === a.role);
      if (!credsBy.has(a.user_id)) credsBy.set(a.user_id, []);
      credsBy.get(a.user_id)!.push({
        title: meta?.label ?? a.role,
        registry: [a.credential_type, a.credential_id ? `#${a.credential_id}` : null].filter(Boolean).join(" ") || (meta?.credentialOrg ?? "Registry"),
        verifiedAt: a.reviewed_at,
      });
    }
  }

  const allPros: Pro[] = healthRows.map((p) => {
    const healthRoles = (p.roles ?? []).filter((r) => HEALTH_KEYS.has(r));
    return {
      userId: p.user_id,
      name: ident.get(p.user_id)?.name ?? "Professional",
      hue: ident.get(p.user_id)?.hue ?? 200,
      avatarUrl: ident.get(p.user_id)?.avatarUrl ?? null,
      credentials: healthRoles.map((r) => CRED_ABBR[r]).filter(Boolean).join(", "),
      specs: healthRoles.map((r) => roleToSpec.get(r)).filter((x): x is (typeof SPECIALTIES)[number] => !!x),
      bio: p.bio,
      headline: p.headline,
      format: p.format ?? "both",
      areaText: p.area_text,
      priceFrom: p.price_from_cents,
      availability: p.availability ?? "accepting",
      nextOpening: p.next_opening,
      sports: p.sports ?? [],
      rating: p.rating_avg != null ? Number(p.rating_avg) : null,
      reviewCount: p.rating_count ?? 0,
      memberSince: p.approved_at ? new Date(p.approved_at).getFullYear() : null,
      verifiedCreds: credsBy.get(p.user_id) ?? [],
      reviews: reviewsBy.get(p.user_id) ?? [],
    };
  });

  /* filters AND-combine; specialty counts recompute against format+search */
  const matchFormat = (p: Pro) => !fFormat || p.format === "both" || p.format === fFormat;
  const matchQ = (p: Pro) =>
    !fQ ||
    [p.name, p.credentials, p.areaText ?? "", ...p.specs.map((s) => s.label)].join(" ").toLowerCase().includes(fQ);
  const matchSpec = (p: Pro, key: string) => p.specs.some((s) => s.key === key);
  const base = allPros.filter((p) => matchFormat(p) && matchQ(p));
  const specCounts = new Map(SPECIALTIES.map((s) => [s.key, base.filter((p) => matchSpec(p, s.key)).length]));
  let shown = fSpec ? base.filter((p) => matchSpec(p, fSpec)) : base;
  shown = [...shown].sort((a, b) => {
    if (fSort === "reviewed") return b.reviewCount - a.reviewCount || (b.rating ?? 0) - (a.rating ?? 0);
    if (fSort === "price") return (a.priceFrom ?? 1e12) - (b.priceFrom ?? 1e12);
    if (fSort === "near") {
      const av = a.format === "virtual" ? 1 : 0;
      const bv = b.format === "virtual" ? 1 : 0;
      return av - bv || (a.areaText ?? "zzz").localeCompare(b.areaText ?? "zzz");
    }
    return (b.rating ?? 0) - (a.rating ?? 0) || b.reviewCount - a.reviewCount || a.name.localeCompare(b.name);
  });
  const openPro = openProId ? allPros.find((p) => p.userId === openProId) ?? null : null;

  /* href builder preserving state */
  const buildHref = (patch: Record<string, string | null>) => {
    const next = new URLSearchParams();
    const current: Record<string, string> = { format: fFormat, spec: fSpec, q: sp(raw.q), sort: fSort === "top" ? "" : fSort, topic: fTopic, lq: sp(raw.lq), lsort: lSort === "new" ? "" : lSort, page: page > 1 ? String(page) : "" };
    for (const [k, v] of Object.entries({ ...current, ...patch })) if (v) next.set(k, v);
    const qs = next.toString();
    return qs ? `/health?${qs}` : "/health";
  };

  /* ── library: search × topic × sort; Load more paginates ─────────── */
  const { data: readRows } = await supabase.from("health_article_reads").select("slug, reads");
  const readsBySlug = new Map((readRows ?? []).map((r) => [r.slug, r.reads]));
  const fmtReads = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(1)}K` : String(n));

  const libBase = HEALTH_ARTICLES.filter((a) => !lQ || [a.title, a.dek, topicLabel.get(a.topic) ?? ""].join(" ").toLowerCase().includes(lQ));
  const topicCounts = new Map(HEALTH_TOPICS.map((t) => [t.key, libBase.filter((a) => a.topic === t.key).length]));
  let reads = fTopic ? libBase.filter((a) => a.topic === fTopic) : libBase;
  reads = [...reads].sort((a, b) => {
    if (lSort === "read") return (readsBySlug.get(b.slug) ?? 0) - (readsBySlug.get(a.slug) ?? 0) || a.title.localeCompare(b.title);
    if (lSort === "az") return a.title.localeCompare(b.title);
    return b.reviewedAt.localeCompare(a.reviewedAt) || a.title.localeCompare(b.title);
  });
  const PAGE_SIZE = 25;
  const visible = reads.slice(0, page * PAGE_SIZE);
  const featured = FEATURED_COLLECTION.slugs.map((s) => articleBySlug.get(s)).filter(Boolean);
  const featuredMins = featured.reduce((n, a) => n + (a?.minutes ?? 0), 0);
  const tagColCh = `calc(${LONGEST_TOPIC_CH}ch + ${(LONGEST_TOPIC_CH * 0.1).toFixed(1)}em + 18px)`;

  const av = (p: Pro, size: number, text: string) =>
    p.avatarUrl ? (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={p.avatarUrl} alt="" className="rounded-full border border-rule object-cover" style={{ width: size, height: size }} />
    ) : (
      <span className={`grid place-items-center rounded-full font-bold text-white ${text}`} style={{ width: size, height: size, background: `oklch(0.62 0.14 ${p.hue})` }}>
        {p.name.slice(0, 1).toUpperCase()}
      </span>
    );

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      {/* header */}
      <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className={`${mono} text-[10px] font-bold uppercase tracking-[.2em] text-flame-text`}>Discover — Health &amp; Nutrition</p>
          <h1 className="mt-1.5 font-display text-[40px] font-bold leading-none tracking-[-0.025em] text-ink">The Training Room</h1>
          <p className="mt-1 max-w-2xl text-sm text-mute">Credential-verified sports-health pros, rated by the members who work with them — and a practical library the pros review themselves.</p>
        </div>
        <Link href="/settings/professional" className="press flex shrink-0 items-center gap-1.5 rounded-full border border-rule-2 bg-surface px-4 py-2.5 text-sm font-semibold text-flame-text transition-colors hover:text-brand-deep">
          <HeartPulse size={15} /> Offer your services
        </Link>
      </div>

      {notice === "chat" ? <p className="mb-4 rounded-[12px] border border-[#f0c2b0] bg-[#fbeee7] px-3.5 py-2.5 text-[13px] font-semibold text-[#b91c1c]">Couldn&rsquo;t open the chat — that pro may not be accepting messages right now.</p> : null}
      {notice === "reported" ? <p className="mb-4 rounded-[12px] border border-[#cfe3d2] bg-[#f2f9f3] px-3.5 py-2.5 text-[13px] font-semibold text-[#1f7a33]">Report received — our team will review it.</p> : null}

      {/* ── 2a. Verified professionals ─────────────────────────────── */}
      <section>
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className={`${mono} text-[9.5px] font-bold uppercase tracking-[.18em] text-flame-text`}>Find a pro</p>
            <h2 className="mt-0.5 font-display text-xl font-bold text-ink">Verified professionals</h2>
            <p className="mt-0.5 max-w-2xl text-xs text-mute">Every credential is checked against its issuing body, and reviews come from named Klimr members. Sessions and payment are arranged directly with the pro.</p>
          </div>
          <p className={`${mono} text-[10px] font-bold uppercase tracking-wider text-faint`}>{shown.length} of {allPros.length} verified</p>
        </div>

        <div className="mt-3"><ProControls /></div>

        <div className="mt-2.5 flex flex-wrap gap-1.5">
          <Link href={buildHref({ spec: null, page: null })} className={`press rounded-full border px-3 py-1.5 text-xs font-semibold ${!fSpec ? "border-[#FFD4BC] bg-tint-brand text-brand-deep" : "border-rule bg-surface text-ink-soft hover:text-ink"}`}>
            All specialties <span className={`${mono} ml-1 text-[10px]`}>{base.length}</span>
          </Link>
          {SPECIALTIES.map((s) => (
            <Link
              key={s.key}
              href={buildHref({ spec: fSpec === s.key ? null : s.key, page: null })}
              className="press rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors"
              style={fSpec === s.key ? { background: s.bg, borderColor: s.bd, color: s.fg } : undefined}
            >
              <span className={fSpec === s.key ? "" : "text-ink-soft"}>{s.label}</span> <span className={`${mono} ml-1 text-[10px] ${fSpec === s.key ? "" : "text-faint"}`}>{specCounts.get(s.key)}</span>
            </Link>
          ))}
        </div>

        {/* bounded results well — page height never grows with the directory */}
        <div className="mt-4 rounded-[18px] border border-[#EFE9DC] bg-[#FDFBF7] p-3" style={{ maxHeight: 540, overflowY: "auto", overscrollBehavior: "contain" }}>
          {allPros.length === 0 ? (
            <div className="grid place-items-center rounded-2xl border-2 border-dashed border-rule-2 bg-surface/60 px-6 py-12 text-center">
              <p className="text-sm font-bold text-ink">No health professionals yet — be the first.</p>
              <p className="mt-1 max-w-md text-xs text-mute">Sports dietitians, physical therapists, athletic trainers, sports massage, and mental-performance pros. Virtual pros serve every ZIP from day one.</p>
              <Link href="/settings/professional" className="press mt-4 inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-sm font-bold text-white" style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}>
                Apply as a professional <ArrowRight size={14} />
              </Link>
            </div>
          ) : shown.length === 0 ? (
            <div className="grid place-items-center rounded-2xl bg-surface px-6 py-12 text-center">
              <Binoculars size={22} className="text-faint" />
              <p className="mt-2 text-sm font-semibold text-ink">No pros match those filters.</p>
              <Link href="/health" className="press mt-2 text-xs font-semibold text-brand-deep hover:underline">Clear filters</Link>
            </div>
          ) : (
            <div className="grid gap-3" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(310px,1fr))" }}>
              {shown.map((p) => (
                <Link
                  key={p.userId}
                  href={buildHref({ pro: p.userId } as Record<string, string | null>)}
                  scroll={false}
                  className="press block rounded-2xl border border-rule bg-white p-4 shadow-[0_1px_2px_rgba(80,60,30,.04)] transition-all hover:-translate-y-0.5 hover:shadow-[0_10px_28px_-18px_rgba(90,68,35,.35)]"
                >
                  <div className="flex items-start gap-3">
                    <div className="relative shrink-0">
                      {av(p, 46, "text-base")}
                      <span className="absolute -bottom-0.5 -right-0.5 grid h-4.5 w-4.5 place-items-center rounded-full bg-[#D63A0F] ring-2 ring-white">
                        <BadgeCheck size={11} className="text-white" />
                      </span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[14.5px] font-bold leading-tight text-ink">{p.name}</p>
                      <p className={`${mono} text-[10px] text-mute`}>{p.credentials || "Verified pro"}</p>
                    </div>
                    <div className="text-right">
                      <p className={`${mono} flex items-center justify-end gap-1 text-[13px] font-bold text-ink`}>
                        <Star size={12} className="fill-[#E8A50C] text-[#E8A50C]" /> {p.rating != null ? p.rating.toFixed(1) : "—"}
                      </p>
                      <p className={`${mono} text-[9px] uppercase text-faint`}>({p.reviewCount}) members</p>
                    </div>
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    {p.specs.map((s) => (
                      <span key={s.key} className="rounded-full border px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: s.bg, borderColor: s.bd, color: s.fg }}>
                        {s.one}
                      </span>
                    ))}
                    <span className={`${mono} rounded-full border border-rule bg-bg px-2 py-0.5 text-[9.5px] font-semibold uppercase text-ink-soft`}>
                      {p.format === "virtual" ? "Virtual · Nationwide" : p.areaText ? `${p.areaText}${p.format === "both" ? " + Virtual" : ""}` : p.format === "both" ? "In-person + Virtual" : "In-person"}
                    </span>
                  </div>
                  <div className="mt-2.5 flex items-center justify-between gap-2 text-xs">
                    <span className="flex items-center gap-1.5 text-ink-soft">
                      <span className="h-1.5 w-1.5 rounded-full" style={{ background: p.availability === "accepting" ? "#2F9E44" : "#D97706" }} />
                      {p.availability === "accepting" ? `Accepting clients${p.nextOpening ? ` · next ${p.nextOpening}` : ""}` : `Waitlist${p.nextOpening ? ` · ${p.nextOpening}` : ""}`}
                    </span>
                    {p.priceFrom ? <span className={`${mono} font-bold text-ink`}>from ${Math.round(p.priceFrom / 100)}</span> : null}
                  </div>
                  <div className="mt-2.5 flex items-center justify-between border-t border-rule-soft pt-2 text-xs">
                    <span className="text-faint">{p.sports.length ? p.sports.join(" · ") : "All Klimr sports"}</span>
                    <span className="font-semibold text-flame-text">View profile →</span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ── 2b. The Training Table ─────────────────────────────────── */}
      <section id="library" className="mt-10 scroll-mt-24">
        <p className={`${mono} text-[9.5px] font-bold uppercase tracking-[.18em] text-flame-text`}>The library</p>
        <h2 className="mt-0.5 font-display text-xl font-bold text-ink">The Training Table</h2>
        <p className="mt-0.5 text-xs text-mute">Short, practical reads for players — sourced to recognized bodies, with named professional review rolling out across the library.</p>

        {/* featured collection */}
        <div className="mt-4 flex flex-wrap items-center gap-5 rounded-[20px] border border-[#FFD9C2] p-5" style={{ background: "linear-gradient(135deg,#FFF0E8,#FFF7F0)" }}>
          <div className="min-w-[260px] flex-1">
            <p className={`${mono} text-[9px] font-bold uppercase tracking-[.18em] text-flame-text`}>Featured collection</p>
            <h3 className="mt-1 font-display text-lg font-bold text-ink">{FEATURED_COLLECTION.title}</h3>
            <p className="mt-1 text-[13px] leading-relaxed text-ink-soft">{FEATURED_COLLECTION.dek}</p>
            <p className={`${mono} mt-2 text-[10px] font-bold uppercase tracking-wider text-faint`}>{featured.length} reads · {featuredMins} min</p>
            <Link href={`/health/read/${FEATURED_COLLECTION.slugs[0]}`} className="press mt-3 inline-flex items-center gap-1.5 rounded-full px-4 py-2 text-sm font-bold text-white" style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}>
              Start reading <ArrowRight size={14} />
            </Link>
          </div>
          <svg width="280" height="124" viewBox="0 0 280 124" aria-hidden className="hidden md:block">
            {["TAPER", "FUEL", "HYDRATE", "MOVE", "RESET"].map((l, i) => {
              const x = 24 + i * 58;
              const y = 100 - i * 18;
              return (
                <g key={l}>
                  {i > 0 ? <line x1={x - 58} y1={100 - (i - 1) * 18} x2={x} y2={y} stroke="#E9C4AC" strokeWidth="2" strokeDasharray="3 4" /> : null}
                  <circle cx={x} cy={y} r="9" fill={i === 0 ? "#FF4E1B" : i === 4 ? "#E8A50C" : "#fff"} stroke={i === 0 || i === 4 ? "none" : "#F0B08C"} strokeWidth="2" />
                  <text x={x} y={y + 24} textAnchor="middle" fontSize="8" fontFamily="monospace" fontWeight="700" fill="#A66B4B">{l}</text>
                </g>
              );
            })}
          </svg>
        </div>

        {/* browse by topic */}
        <div className="mt-4 grid gap-2.5" style={{ gridTemplateColumns: "repeat(auto-fill,minmax(200px,1fr))" }}>
          {HEALTH_TOPICS.map((t) => {
            const active = fTopic === t.key;
            return (
              <Link
                key={t.key}
                href={buildHref({ topic: active ? null : t.key, page: null }) + "#library"}
                scroll={false}
                className={`press rounded-2xl border p-3.5 transition-colors ${active ? "border-[#FFD4BC] bg-tint-brand" : "border-rule bg-surface hover:bg-[#FBF8F1]"}`}
              >
                <p className="flex items-center justify-between text-[13.5px] font-bold text-ink">
                  {t.label} <span className={`${mono} text-[10px] font-bold ${active ? "text-brand-deep" : "text-faint"}`}>{topicCounts.get(t.key)}</span>
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-faint">{t.desc}</p>
              </Link>
            );
          })}
        </div>

        {/* the index */}
        <div className="mt-4 rounded-[20px] border border-rule bg-white p-4">
          <div className="flex flex-wrap items-center gap-2.5">
            <LibraryControls />
            <p className={`${mono} shrink-0 text-[10px] font-bold uppercase tracking-wider text-faint`}>
              Showing {visible.length} of {reads.length} reads{fTopic ? ` · ${topicLabel.get(fTopic)}` : ""}
            </p>
          </div>

          <div className="mt-3 divide-y divide-rule-soft">
            {visible.map((a) => {
              const n = readsBySlug.get(a.slug) ?? 0;
              return (
                <Link key={a.slug} href={`/health/read/${a.slug}`} className="press grid items-center gap-3 py-3 transition-colors hover:bg-[#FBF8F1] sm:grid-cols-[var(--tag)_1fr_auto]" style={{ ["--tag" as string]: tagColCh }}>
                  <span className={`${mono} w-fit rounded-md border border-rule bg-bg px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wide text-ink-soft sm:w-auto sm:text-center`}>
                    {topicLabel.get(a.topic)}
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-ink">{a.title}</span>
                    <span className="block truncate text-xs text-mute">{a.dek}</span>
                    <span className="mt-0.5 flex items-center gap-1 text-[10.5px] text-faint">
                      <ShieldCheck size={10} className="text-success" />
                      {a.reviewedBy ? `Reviewed by ${a.reviewedBy.name}, ${a.reviewedBy.credentials}` : `Sourced: ${a.sources.map((s) => s.label.split(" — ")[0]).join(" · ")}`}
                    </span>
                  </span>
                  <span className={`${mono} text-right text-[10px] font-bold uppercase text-faint`}>
                    {n > 0 ? <span className="block">{n >= 1000 ? fmtReads(n) : n} reads</span> : null}
                    <span className="block">{a.minutes} min · {new Date(a.reviewedAt + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", year: "numeric" }).toUpperCase()}</span>
                  </span>
                </Link>
              );
            })}
            {visible.length === 0 ? (
              <div className="grid place-items-center py-10 text-center">
                <BookOpen size={20} className="text-faint" />
                <p className="mt-2 text-sm font-semibold text-ink">No reads match your search.</p>
                <Link href={buildHref({ lq: null, topic: null, page: null }) + "#library"} className="press mt-1 text-xs font-semibold text-brand-deep hover:underline">Clear search</Link>
              </div>
            ) : null}
          </div>

          {visible.length < reads.length ? (
            <div className="mt-3 text-center">
              <Link href={buildHref({ page: String(page + 1) }) + "#library"} scroll={false} className="press inline-flex rounded-full border border-rule-2 bg-surface px-4 py-2 text-sm font-semibold text-ink-soft hover:text-ink">
                Load more reads
              </Link>
            </div>
          ) : null}
        </div>

        {/* courtside questions */}
        <div className="mt-5 rounded-[20px] border border-rule bg-white p-5">
          <p className={`${mono} text-[9.5px] font-bold uppercase tracking-[.18em] text-flame-text`}>Courtside questions</p>
          <p className="mt-0.5 text-xs text-mute">Quick answers from the library — general education, not medical advice.</p>
          <div className="mt-2"><QuickAnswers items={QUICK_ANSWERS} /></div>
        </div>

        <p className="mt-4 text-[11.5px] leading-relaxed text-faint">
          The Training Table is general education, not medical, dietetic, or mental-health advice. Content follows published guidance from bodies like the NIH, CDC, ACSM, and the Academy of Nutrition and Dietetics, and named professional review is rolling out across the library (<Link href="/health/review-policy" className="underline hover:text-ink">how we review content</Link>). For anything personal, work with a verified pro above or your own clinician. If something feels seriously wrong — chest pain, heat illness, a pop followed by swelling — stop playing and seek medical care.
        </p>
      </section>

      {/* ── pro profile overlay (?pro=) ─────────────────────────────── */}
      {openPro ? (
        <div className="fixed inset-0 z-50 grid place-items-center p-4" style={{ background: "rgba(32,27,18,.44)", backdropFilter: "blur(4px)" }}>
          <div className="grid max-h-[88dvh] w-full max-w-3xl grid-cols-1 overflow-y-auto rounded-[22px] bg-white shadow-2xl md:grid-cols-[58%_42%]">
            <div className="p-5 sm:p-6">
              <div className="flex items-start gap-3.5">
                {av(openPro, 54, "text-lg")}
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-1.5 font-display text-[21px] font-bold leading-tight text-ink">
                    {openPro.name} <BadgeCheck size={17} className="text-[#D63A0F]" />
                  </p>
                  <p className={`${mono} text-[11px] text-mute`}>{openPro.credentials}</p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {openPro.specs.map((s) => (
                      <span key={s.key} className="rounded-full border px-2 py-0.5 text-[10.5px] font-semibold" style={{ background: s.bg, borderColor: s.bd, color: s.fg }}>{s.one}</span>
                    ))}
                  </div>
                  <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-soft">
                    <Stars value={openPro.rating ?? 0} /> {openPro.rating != null ? openPro.rating.toFixed(1) : "No rating yet"} · {openPro.reviewCount} member {openPro.reviewCount === 1 ? "review" : "reviews"}
                  </p>
                </div>
                <Link href={buildHref({ pro: null } as Record<string, string | null>)} scroll={false} aria-label="Close profile" className="press text-mute hover:text-ink"><X size={18} /></Link>
              </div>
              {openPro.headline ? <p className="mt-3 text-sm font-semibold text-ink-soft">{openPro.headline}</p> : null}
              {openPro.bio ? <p className="mt-1.5 text-[13px] leading-relaxed text-mute">{openPro.bio}</p> : null}

              <p className={`${mono} mt-4 text-[9.5px] font-bold uppercase tracking-[.18em] text-faint`}>Verified credentials</p>
              <div className="mt-1.5 grid gap-2">
                {openPro.verifiedCreds.length ? openPro.verifiedCreds.map((c, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <ShieldCheck size={14} className="mt-0.5 shrink-0 text-success" />
                    <div>
                      <p className="text-[13px] font-semibold text-ink">{c.title}</p>
                      <p className={`${mono} text-[10px] uppercase text-faint`}>
                        {c.registry}{c.verifiedAt ? ` · verified ${new Date(c.verifiedAt).toLocaleDateString("en-US", { month: "short", year: "numeric" })}` : ""}
                      </p>
                    </div>
                  </div>
                )) : <p className="text-xs text-mute">Credential details on file with Klimr admin.</p>}
              </div>

              <p className={`${mono} mt-4 text-[9.5px] font-bold uppercase tracking-[.18em] text-faint`}>Member reviews</p>
              <div className="mt-1.5">
                <ProviderReviews providerUserId={openPro.userId} ratingAvg={openPro.rating} ratingCount={openPro.reviewCount} reviews={openPro.reviews} viewerId={user.id} />
              </div>
            </div>

            <div className="border-t border-rule bg-[#FDFBF7] p-5 sm:p-6 md:border-l md:border-t-0">
              <p className={`${mono} text-[9.5px] font-bold uppercase tracking-[.18em] text-faint`}>Sessions</p>
              {openPro.priceFrom ? (
                <p className="mt-1 text-ink"><span className={`${mono} text-[28px] font-bold`}>${Math.round(openPro.priceFrom / 100)}</span> <span className="text-xs text-mute">/ session</span></p>
              ) : (
                <p className="mt-1 text-sm text-mute">Rates on request</p>
              )}
              <div className="mt-3 rounded-xl border border-rule bg-white p-3 text-xs text-ink-soft">
                <p className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full" style={{ background: openPro.availability === "accepting" ? "#2F9E44" : "#D97706" }} />
                  {openPro.availability === "accepting" ? "Accepting clients" : "Waitlist"}{openPro.nextOpening ? ` · ${openPro.nextOpening}` : ""}
                </p>
                <p className="mt-1">{openPro.format === "virtual" ? "Virtual sessions" : openPro.format === "inperson" ? `In person${openPro.areaText ? ` · ${openPro.areaText}` : ""}` : `In person${openPro.areaText ? ` · ${openPro.areaText}` : ""} + virtual`}</p>
                {openPro.memberSince ? <p className={`${mono} mt-1 text-[10px] uppercase text-faint`}>On Klimr since {openPro.memberSince}</p> : null}
              </div>
              {openPro.userId !== user.id ? (
                <form action={messagePro} className="mt-3">
                  <input type="hidden" name="pro_id" value={openPro.userId} />
                  <button className="press w-full rounded-xl py-3 text-sm font-bold text-white hover:brightness-[1.06]" style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}>
                    Message {openPro.name.split(" ")[0]}
                  </button>
                </form>
              ) : null}
              <p className="mt-3 text-[11px] leading-relaxed text-faint">Sessions and payment are arranged directly with the professional. Klimr verifies credentials and hosts member reviews — it is not a healthcare provider.</p>
              {openPro.userId !== user.id ? (
                <details className="mt-3">
                  <summary className="cursor-pointer text-[11px] font-semibold text-faint underline hover:text-ink">Report</summary>
                  <form action={reportProvider} className="mt-2 grid gap-2">
                    <input type="hidden" name="pro_id" value={openPro.userId} />
                    <textarea name="reason" rows={2} required minLength={3} maxLength={600} placeholder="What's wrong with this profile?" className="w-full resize-y rounded-[10px] border border-rule-2 bg-white px-3 py-2 text-xs text-ink outline-none placeholder:text-faint focus:border-brand" />
                    <button className="press w-fit rounded-lg border border-rule-2 bg-white px-3 py-1.5 text-xs font-semibold text-ink-soft hover:text-ink">Send report</button>
                  </form>
                </details>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
