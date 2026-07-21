import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { BadgeCheck, Globe, Handshake, Mail, MapPin, Phone, Settings2, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SportIcon } from "@/components/sport-icons";
import { kindLabel } from "@/lib/business";
import { sportMeta } from "@/lib/sports";

export const dynamic = "force-dynamic";

type Biz = {
  id: string;
  kind: string;
  name: string;
  slug: string;
  headline: string | null;
  bio: string | null;
  website: string | null;
  contact_email: string | null;
  phone: string | null;
  area_text: string | null;
  sports: string[];
  verification_level: string;
  status: string;
  published: boolean;
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  return { title: `${slug.replace(/-[a-z0-9]{4}$/, "").replace(/-/g, " ")} · Klimr` };
}

/** Public business page. RLS does the visibility math: published+active rows
 *  resolve for everyone; unpublished rows resolve only for members — which
 *  gives owners a true preview of exactly what the world will see. */
export default async function PublicBusinessPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/b/${slug}`);

  const { data: flag } = await supabase.from("feature_flags").select("enabled").eq("key", "business_publication").maybeSingle();
  if (!flag?.enabled) notFound();

  const { data: b } = await supabase
    .from("business_accounts")
    .select("id, kind, name, slug, headline, bio, website, contact_email, phone, area_text, sports, verification_level, status, published")
    .eq("slug", slug)
    .maybeSingle();
  if (!b) notFound();
  const biz = b as Biz;

  const { data: membership } = await supabase
    .from("business_members")
    .select("role")
    .eq("business_id", biz.id)
    .eq("user_id", user.id)
    .maybeSingle();
  const isMember = !!membership;
  const publiclyVisible = biz.published && biz.status === "active";

  // Active sponsorships — every one of these was consented to by its target.
  const { data: spons } = await supabase
    .from("sponsorships")
    .select("id, target_kind, target_id, label")
    .eq("business_id", biz.id)
    .eq("status", "active")
    .limit(12);
  const sponsRows = (spons ?? []) as { id: string; target_kind: string; target_id: string; label: string }[];
  const byKind = (k: string) => sponsRows.filter((s) => s.target_kind === k).map((s) => s.target_id);
  const targetName = new Map<string, string>();
  const targetHref = new Map<string, string>();
  const [evIds, teamIds, playerIds] = [byKind("event"), byKind("team"), byKind("player")];
  const [{ data: evs }, { data: tms }, { data: pls }] = await Promise.all([
    evIds.length ? supabase.from("events").select("id, title").in("id", evIds) : Promise.resolve({ data: [] }),
    teamIds.length ? supabase.from("teams").select("id, name").in("id", teamIds) : Promise.resolve({ data: [] }),
    playerIds.length ? supabase.from("profiles").select("id, display_name").in("id", playerIds) : Promise.resolve({ data: [] }),
  ]);
  for (const e of (evs ?? []) as { id: string; title: string }[]) {
    targetName.set(e.id, e.title);
    targetHref.set(e.id, `/events/${e.id}`);
  }
  for (const t of (tms ?? []) as { id: string; name: string }[]) {
    targetName.set(t.id, t.name);
    targetHref.set(t.id, `/team/${t.id}`);
  }
  for (const p of (pls ?? []) as { id: string; display_name: string }[]) {
    targetName.set(p.id, p.display_name);
    targetHref.set(p.id, `/profile/${p.id}`);
  }

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      {!publiclyVisible && isMember ? (
        <div className="mb-5 rounded-2xl border border-warning/30 bg-tint-warning px-4 py-3 text-sm text-ink">
          <span className="font-semibold">Preview.</span> Only your team can see this page right now
          {biz.status === "draft" ? " — it goes public after review, once you list it." : " — list it from the console when ready."}
        </div>
      ) : null}

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="font-mono text-[10px] font-bold uppercase tracking-[.16em] text-faint">{kindLabel(biz.kind)}</p>
          <h1 className="mt-1 font-display text-3xl font-bold leading-tight text-ink sm:text-4xl">{biz.name}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {biz.verification_level === "tier2" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-tint-brand px-2.5 py-1 text-xs font-bold text-brand-deep">
                <ShieldCheck size={13} /> Sponsor-ready
              </span>
            ) : biz.verification_level === "tier1" ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-tint-success px-2.5 py-1 text-xs font-bold text-success">
                <BadgeCheck size={13} /> Verified
              </span>
            ) : null}
            {biz.area_text ? (
              <span className="inline-flex items-center gap-1 text-sm text-mute">
                <MapPin size={14} /> {biz.area_text}
              </span>
            ) : null}
            {biz.sports.map((s) => (
              <span key={s} className="inline-flex items-center gap-1 rounded-full border border-rule bg-surface px-2.5 py-1 text-xs font-semibold text-ink">
                <SportIcon sport={s} variant="badge" size={13} /> {sportMeta(s).name}
              </span>
            ))}
          </div>
          {biz.headline ? <p className="mt-3 max-w-2xl text-base text-ink-soft">{biz.headline}</p> : null}
        </div>
        {isMember ? (
          <Link
            href={`/business/${biz.id}`}
            className="press inline-flex shrink-0 items-center gap-1.5 rounded-full border border-rule bg-surface px-4 py-2 text-sm font-semibold text-ink hover:border-faint"
          >
            <Settings2 size={15} /> Manage
          </Link>
        ) : null}
      </div>

      <div className="mt-7 grid items-start gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {biz.bio ? (
            <div className="rounded-2xl border border-rule bg-surface p-5 shadow-e1">
              <p className="kicker mb-2">About</p>
              <p className="whitespace-pre-line text-sm leading-relaxed text-ink">{biz.bio}</p>
            </div>
          ) : null}

          {sponsRows.length ? (
            <div className="rounded-2xl border border-rule bg-surface p-5 shadow-e1">
              <p className="kicker mb-2 flex items-center gap-1.5">
                <Handshake size={14} /> Proud sponsor of
              </p>
              <ul className="grid gap-2 sm:grid-cols-2">
                {sponsRows.map((s) => (
                  <li key={s.id}>
                    <Link
                      href={targetHref.get(s.target_id) ?? "#"}
                      className="flex items-center justify-between gap-2 rounded-xl border border-rule bg-bg px-3 py-2 text-sm transition-colors hover:border-faint"
                    >
                      <span className="min-w-0 truncate font-semibold text-ink">{targetName.get(s.target_id) ?? "—"}</span>
                      <span className="shrink-0 text-xs text-faint">{s.label}</span>
                    </Link>
                  </li>
                ))}
              </ul>
              <p className="mt-2.5 text-[11px] text-faint">Every listing here was approved by the sponsored side.</p>
            </div>
          ) : null}
        </div>

        <aside className="space-y-4">
          {biz.website || biz.contact_email || biz.phone ? (
            <div className="rounded-2xl border border-rule bg-surface p-4 shadow-e1">
              <p className="kicker mb-2">Contact</p>
              <ul className="space-y-2 text-sm">
                {biz.website ? (
                  <li>
                    <a
                      href={biz.website.startsWith("http") ? biz.website : `https://${biz.website}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1.5 font-semibold text-ink underline-offset-2 hover:underline"
                    >
                      <Globe size={14} /> {biz.website.replace(/^https?:\/\//, "")}
                    </a>
                  </li>
                ) : null}
                {biz.contact_email ? (
                  <li className="inline-flex items-center gap-1.5 text-ink">
                    <Mail size={14} /> {biz.contact_email}
                  </li>
                ) : null}
                {biz.phone ? (
                  <li className="inline-flex items-center gap-1.5 text-ink">
                    <Phone size={14} /> {biz.phone}
                  </li>
                ) : null}
              </ul>
            </div>
          ) : null}
        </aside>
      </div>
    </div>
  );
}
