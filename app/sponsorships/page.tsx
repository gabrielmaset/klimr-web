import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Sparkles, MapPin, ChevronRight, Trophy, Eye, Shield, Target, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { PageHeader, StatusPill } from "@/components/page-header";
import { respondToOffer } from "./actions";

export const metadata: Metadata = { title: "Sponsorships" };

type Sponsor = {
  id: string;
  name: string;
  hue: number;
  type: string;
  location: string | null;
  tagline: string | null;
  perks: string[];
};
type Mine = { id: string; status: string; category: string; term: string; sponsor_id: string };

const monoKicker = "font-mono text-[9.5px] font-bold uppercase tracking-[.18em]";

// Category identity — deterministic tones per partner type (spec palette).
const TYPE_TONES: { match: RegExp; fg: string; bg: string; bd: string }[] = [
  { match: /club/i, fg: "#A16207", bg: "#FBF3DE", bd: "#EFE0B4" },
  { match: /equipment|gear/i, fg: "#1D4ED8", bg: "#EAF1FE", bd: "#CDDEFA" },
  { match: /apparel|clothing/i, fg: "#BE185D", bg: "#FDEDF4", bd: "#F7D2E2" },
  { match: /court|venue|facility/i, fg: "#4D7C0F", bg: "#F1F8E3", bd: "#DCEBC0" },
];
function typeTone(type: string) {
  return TYPE_TONES.find((t) => t.match.test(type)) ?? { fg: "#C2410C", bg: "#FFF0E8", bd: "#FFD4BC" };
}

function BrandTile({ name, hue, size = 56 }: { name: string; hue: number; size?: number }) {
  return (
    <span
      className="grid shrink-0 place-items-center rounded-[14px] font-display font-bold text-white"
      style={{
        width: size,
        height: size,
        background: `linear-gradient(140deg, hsl(${hue} 82% 52%), hsl(${hue} 85% 38%))`,
        fontSize: size * 0.42,
        boxShadow: "0 10px 22px -12px rgba(32,27,18,.45)",
      }}
    >
      {name.slice(0, 1)}
    </span>
  );
}

export default async function SponsorshipsPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/sponsorships");

  const [{ data: sponsorRows }, { data: mineRows }, { data: profile }, { data: sportRows }] = await Promise.all([
    supabase.from("sponsors").select("id, name, hue, type, location, tagline, perks").order("name"),
    supabase.from("player_sponsorships").select("id, status, category, term, sponsor_id").eq("player_id", user.id),
    supabase.from("profiles").select("primary_sport").eq("id", user.id).maybeSingle(),
    supabase.from("player_sports").select("sport_key, points").eq("user_id", user.id),
  ]);

  const sponsors = (sponsorRows as Sponsor[] | null) ?? [];
  const byId = new Map(sponsors.map((s) => [s.id, s]));
  const mine = (mineRows as Mine[] | null) ?? [];
  const offers = mine.filter((m) => m.status === "offered");
  const active = mine.filter((m) => m.status === "active");

  const topSport = (sportRows ?? []).slice().sort((a, b) => (b.points ?? 0) - (a.points ?? 0))[0];
  const primary = topSport?.sport_key ?? profile?.primary_sport ?? null;
  const primaryMeta = primary ? sportMeta(primary) : null;

  // Real footprint numbers, computed — never invented.
  const categories = [...new Set(sponsors.map((s) => s.type))];
  const areas = [...new Set(sponsors.map((s) => s.location).filter(Boolean))];

  return (
    <div className="mx-auto max-w-page px-[30px] pb-16 pt-[22px]">
      <PageHeader
        kicker="Discover — Sponsorships"
        title="Where local brands back local champions."
        sub="Pro sponsorships, brought to amateurs — shops, clubs, and brands in your area partner with the players climbing their ladders."
        pill={sponsors.length > 0 ? <StatusPill dot="flame">{sponsors.length} local {sponsors.length === 1 ? "sponsor" : "sponsors"} on Klimr</StatusPill> : undefined}
      />

      {/* Footprint — real, computed */}
      {sponsors.length > 0 ? (
        <div className="mt-5 grid grid-cols-3 gap-3 sm:max-w-xl">
          {[
            { v: sponsors.length, l: "Local sponsors" },
            { v: categories.length, l: categories.length === 1 ? "Partner category" : "Partner categories" },
            { v: areas.length, l: areas.length === 1 ? "Neighborhood" : "Neighborhoods" },
          ].map((s) => (
            <div key={s.l} className="rounded-[12px] bg-bg px-3 py-2.5" style={{ border: "1px solid #EFE9DC" }}>
              <p className="font-display text-[22px] font-bold leading-none text-ink">{s.v}</p>
              <p className={`${monoKicker} mt-1 text-[8.5px] text-faint`}>{s.l}</p>
            </div>
          ))}
        </div>
      ) : null}

      {/* Why sponsor here — the pitch */}
      <div className="mt-6 grid gap-3.5 md:grid-cols-3">
        {[
          { Icon: Eye, t: "Seen where players look daily", d: "Sponsors appear beside the rankings, matches, and feeds that active players check every day — not buried in a directory." },
          { Icon: Shield, t: "Category exclusivity", d: "Players hold one partner per category, so your brand isn\u2019t stacked against direct competitors on the same jersey." },
          { Icon: Target, t: "Neighborhood-level targeting", d: "Back players by ZIP and city ladder — your name travels exactly where your customers play." },
        ].map(({ Icon, t, d }) => (
          <div key={t} className="rounded-[18px] border border-rule bg-surface p-5 shadow-e1">
            <span className="grid h-9 w-9 place-items-center rounded-[11px] bg-tint-brand text-brand-deep">
              <Icon size={17} />
            </span>
            <p className="mt-3 font-display text-[15px] font-bold leading-tight text-ink">{t}</p>
            <p className="mt-1.5 text-[12.5px] leading-relaxed text-mute">{d}</p>
          </div>
        ))}
      </div>

      {/* pending offers — player side */}
      {offers.length > 0 ? (
        <section className="mt-8">
          <h2 className={`${monoKicker} mb-2.5 text-flame-text`}>Sponsorship offers</h2>
          <div className="space-y-3">
            {offers.map((o) => {
              const s = byId.get(o.sponsor_id);
              if (!s) return null;
              return (
                <div key={o.id} className="rounded-[18px] border p-4" style={{ borderColor: "var(--color-tint-brand-bd)", background: "linear-gradient(130deg, #FFF1E8, #FFFFFF 58%)" }}>
                  <div className="flex items-center gap-3">
                    <BrandTile name={s.name} hue={s.hue} size={44} />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold text-ink">{s.name} wants to sponsor you</p>
                      <p className="truncate text-xs text-mute">{o.category} offer · {s.type}</p>
                    </div>
                  </div>
                  <p className="mt-2 text-xs text-faint">{o.term}</p>
                  <div className="mt-3 flex items-center gap-2">
                    <form action={respondToOffer}>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="decision" value="accept" />
                      <button className="press rounded-full bg-brand px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-brand-deep">Accept</button>
                    </form>
                    <form action={respondToOffer}>
                      <input type="hidden" name="id" value={o.id} />
                      <input type="hidden" name="decision" value="decline" />
                      <button className="press rounded-full border border-rule px-4 py-2 text-sm font-semibold text-mute transition-colors hover:text-ink">Decline</button>
                    </form>
                    <Link href={`/sponsorships/${s.id}`} className="press ml-auto text-sm font-semibold text-flame-text">Details</Link>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* active partnerships — player side */}
      {active.length > 0 ? (
        <section className="mt-8">
          <h2 className={`${monoKicker} mb-2.5 text-faint`}>Your partnerships</h2>
          <div className="space-y-2.5">
            {active.map((a) => {
              const s = byId.get(a.sponsor_id);
              if (!s) return null;
              return (
                <Link key={a.id} href={`/sponsorships/${s.id}`} className="lift flex items-center gap-3 rounded-[18px] border border-rule bg-surface p-4 shadow-e1">
                  <BrandTile name={s.name} hue={s.hue} size={44} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-bold text-ink">{s.name}</p>
                    <p className="truncate text-xs text-mute">Active · {a.category} · {s.type}</p>
                  </div>
                  <ChevronRight size={18} className="shrink-0 text-faint" />
                </Link>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* eligibility nudge when not sponsored */}
      {offers.length === 0 && active.length === 0 ? (
        <section className="mt-8 rounded-[18px] border border-rule bg-surface p-5 shadow-e1">
          <div className="flex items-center gap-2">
            <Trophy size={15} className="text-sun-text" />
            <span className={`${monoKicker} text-faint`}>Get on the radar</span>
          </div>
          <p className="mt-2 text-[14px] leading-relaxed text-ink-soft">
            {primaryMeta
              ? `Keep climbing your ${primaryMeta.emoji} ${primaryMeta.name} ladder. The higher your local rank, the more visible you are to nearby sponsors.`
              : "Pick up your sport and start climbing your local ladder — the higher your rank, the more visible you are to nearby sponsors."}
          </p>
          <Link href="/rankings" className="press mt-3 inline-flex items-center gap-1 text-sm font-semibold text-flame-text">
            View your rankings <ChevronRight size={15} />
          </Link>
        </section>
      ) : null}

      {/* Partner wall — brands, showcased */}
      {sponsors.length > 0 ? (
        <section className="mt-9">
          <div className="flex items-baseline justify-between gap-4">
            <div>
              <p className={`${monoKicker} text-flame-text`}>The partner wall</p>
              <h2 className="mt-1 font-display text-[22px] font-bold leading-none tracking-[-0.015em] text-ink">Local sponsors on Klimr</h2>
            </div>
          </div>
          <div className="mt-4 grid gap-3.5" style={{ gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))" }}>
            {sponsors.map((s) => {
              const tone = typeTone(s.type);
              return (
                <Link key={s.id} href={`/sponsorships/${s.id}`} className="lift block rounded-[18px] border border-rule bg-surface p-5 shadow-e1">
                  <div className="flex items-start gap-3.5">
                    <BrandTile name={s.name} hue={s.hue} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-display text-[17px] font-bold leading-tight tracking-[-0.01em] text-ink">{s.name}</p>
                      <span className="mt-1 inline-flex rounded-full px-2 py-0.5 font-mono text-[8.5px] font-bold uppercase tracking-[.14em]" style={{ background: tone.bg, color: tone.fg, boxShadow: `inset 0 0 0 1px ${tone.bd}` }}>
                        {s.type}
                      </span>
                    </div>
                    <ArrowRight size={15} className="mt-1 shrink-0 text-faint" />
                  </div>
                  {s.tagline ? <p className="mt-3 line-clamp-2 text-[12.5px] leading-relaxed text-mute">{s.tagline}</p> : null}
                  {s.perks?.length ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {s.perks.slice(0, 2).map((p) => (
                        <span key={p} className="rounded-full border border-rule bg-bg px-2 py-0.5 text-[10.5px] font-semibold text-ink-soft">{p}</span>
                      ))}
                      {s.perks.length > 2 ? <span className="text-[10.5px] font-semibold text-faint">+{s.perks.length - 2} more</span> : null}
                    </div>
                  ) : null}
                  {s.location ? (
                    <p className="mt-3 flex items-center gap-1 border-t border-rule-soft pt-2.5 font-mono text-[9.5px] font-semibold uppercase tracking-[.14em] text-faint">
                      <MapPin size={11} /> {s.location}
                    </p>
                  ) : null}
                </Link>
              );
            })}
          </div>
        </section>
      ) : (
        <section className="mt-9 rounded-[18px] bg-bg px-6 py-8 text-center" style={{ border: "1px solid #EFE9DC" }}>
          <p className="text-sm font-semibold text-ink">The partner wall opens with our first local sponsors.</p>
          <p className="mt-1 text-xs text-mute">Run a business near the courts? Get in early below.</p>
        </section>
      )}

      {/* Business CTA — the page's flame moment */}
      <div className="mt-9 overflow-hidden rounded-[20px] border p-6 sm:p-8" style={{ borderColor: "var(--color-tint-brand-bd2)", background: "linear-gradient(130deg, #FFF1E8, #FFFFFF 58%)" }}>
        <div className="flex flex-wrap items-center justify-between gap-6">
          <div className="min-w-0 max-w-xl">
            <p className={`${monoKicker} text-sun-text`}>For local businesses</p>
            <h2 className="mt-1.5 font-display text-[26px] font-bold leading-tight tracking-[-0.02em] text-ink">Put your name on the neighborhood&rsquo;s best players.</h2>
            <p className="mt-2 text-[13.5px] leading-relaxed text-mute">
              Sponsor a top-ranked player near you — gear, apparel, court time, or perks — and reach the local sports
              community where it actually plays. Exclusive categories, ZIP-level reach, real athletes.
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-3">
              <a
                href="mailto:hello@klimr.com?subject=Sponsoring%20a%20local%20player"
                className="press inline-flex h-[38px] items-center gap-1.5 rounded-[10px] px-4 text-[13.5px] font-bold text-white shadow-flame transition-[filter] hover:brightness-[1.06]"
                style={{ background: "linear-gradient(140deg, #FF6A35, #E23E0D)" }}
              >
                <Sparkles size={15} /> Become a sponsor
              </a>
              <span className="font-mono text-[10px] font-semibold uppercase tracking-[.14em] text-faint">hello@klimr.com</span>
            </div>
          </div>
          <svg width="180" height="120" viewBox="0 0 180 120" aria-hidden className="shrink-0 max-sm:hidden">
            <path d="M10,104 L52,78 L90,90 L128,52 L168,20" fill="none" stroke="rgba(32,27,18,.3)" strokeWidth="2" strokeDasharray="1 7" strokeLinecap="round" />
            <circle cx="168" cy="20" r="8" fill="#fff" stroke="var(--color-sun)" strokeWidth="2.5" />
            <circle cx="10" cy="104" r="7" fill="var(--color-brand)" />
          </svg>
        </div>
      </div>
    </div>
  );
}
