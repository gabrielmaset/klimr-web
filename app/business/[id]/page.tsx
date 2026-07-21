import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { BadgeCheck, ExternalLink, Handshake, TrendingUp, Users } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { PageHeader } from "@/components/page-header";
import { SportIcon } from "@/components/sport-icons";
import { updateBusiness, setBusinessPublished, withdrawSponsorship } from "../actions";
import { SponsorshipProposer } from "@/components/sponsorship-proposer";
import { TierApplication } from "@/components/tier-application";
import { withdrawTierApplication } from "../actions";
import { kindLabel, TIER_LABEL, BUSINESS_STATUS_LABEL, SPONSORSHIP_STATUS_LABEL } from "@/lib/business";
import { formatMilestoneBucket } from "@/lib/analytics-buckets";
import { SPORT_KEYS, sportMeta } from "@/lib/sports";

export const dynamic = "force-dynamic";

const inputCls =
  "w-full rounded-[10px] border border-rule-2 bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/15";

export default async function ManageBusiness({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/business/${id}`);
  const { data: flag } = await supabase.from("feature_flags").select("enabled").eq("key", "business_publication").maybeSingle();
  if (!flag?.enabled) notFound();

  const { data: b } = await supabase
    .from("business_accounts")
    .select("id, kind, name, slug, headline, bio, website, contact_email, phone, area_text, sports, verification_level, status, published, owner_id")
    .eq("id", id)
    .maybeSingle();
  if (!b) notFound();

  const [{ data: memberRows }, { data: sponsorships }, { data: openApp }] = await Promise.all([
    supabase.from("business_members").select("user_id, role").eq("business_id", id),
    supabase
      .from("sponsorships")
      .select("id, target_kind, label, status, amount_cents, created_at")
      .eq("business_id", id)
      .order("created_at", { ascending: false })
      .limit(10),
    supabase
      .from("business_tier_applications")
      .select("id, status, domain, docs, created_at")
      .eq("business_id", id)
      .eq("status", "submitted")
      .maybeSingle(),
  ]);
  const members = (memberRows ?? []) as { user_id: string; role: string }[];
  const myRole = members.find((m) => m.user_id === user.id)?.role;
  const canManage = myRole === "owner" || myRole === "manager";
  const memberIds = members.map((m) => m.user_id);
  const names = new Map<string, string>();
  if (memberIds.length) {
    const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", memberIds);
    for (const p of (profs ?? []) as { id: string; display_name: string }[]) names.set(p.id, p.display_name);
  }

  // Verified reach — milestone buckets only (exact stays server-side).
  // Event targets: cumulative verified check-ins from Event Pulse occurrences.
  // Team targets: roster size. Buckets computed HERE; the client sees strings.
  const activeSpons = ((sponsorships ?? []) as { id: string; target_kind: string; status: string }[]).filter((s) => s.status === "active");
  const reachRows: { id: string; kindLabelText: string; bucket: string | null }[] = [];
  let reachTotal = 0;
  if (activeSpons.length) {
    const { data: fullSpons } = await supabase
      .from("sponsorships")
      .select("id, target_kind, target_id, label")
      .eq("business_id", id)
      .eq("status", "active");
    const rows = (fullSpons ?? []) as { id: string; target_kind: string; target_id: string; label: string }[];
    const evIds = rows.filter((r) => r.target_kind === "event").map((r) => r.target_id);
    const evReach = new Map<string, number>();
    if (evIds.length) {
      const { data: occs } = await supabase
        .from("event_occurrences")
        .select("event_id, verified_count")
        .in("event_id", evIds)
        .eq("status", "completed_with_evidence")
        .limit(2000);
      for (const o of (occs ?? []) as { event_id: string; verified_count: number }[]) {
        evReach.set(o.event_id, (evReach.get(o.event_id) ?? 0) + o.verified_count);
      }
    }
    const teamIds = rows.filter((r) => r.target_kind === "team").map((r) => r.target_id);
    const teamReach = new Map<string, number>();
    if (teamIds.length) {
      const { data: tm } = await supabase.from("team_members").select("team_id").in("team_id", teamIds).limit(2000);
      for (const t of (tm ?? []) as { team_id: string }[]) teamReach.set(t.team_id, (teamReach.get(t.team_id) ?? 0) + 1);
    }
    for (const r of rows) {
      const n = r.target_kind === "event" ? evReach.get(r.target_id) ?? 0
        : r.target_kind === "team" ? teamReach.get(r.target_id) ?? 0 : 0;
      reachTotal += n;
      reachRows.push({ id: r.id, kindLabelText: `${r.label} · ${r.target_kind}`, bucket: formatMilestoneBucket(n) });
    }
  }
  const reachBucket = formatMilestoneBucket(reachTotal);

  const sponsorReady = b.status === "active" && b.verification_level === "tier2";
  const draft = b.status === "draft";

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <PageHeader
        kicker={`Business · ${kindLabel(b.kind)}`}
        title={b.name}
        sub={`${TIER_LABEL[b.verification_level] ?? b.verification_level} · ${BUSINESS_STATUS_LABEL[b.status] ?? b.status}${b.published ? " · Listed" : " · Unlisted"}`}
      />

      <div className="mt-4">
        <Link
          href={`/b/${b.slug}`}
          className="press inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface px-4 py-2 text-sm font-semibold text-ink hover:border-faint"
        >
          <ExternalLink size={14} /> View public page
        </Link>
      </div>

      {draft ? (
        <div className="mt-5 rounded-2xl border border-warning/30 bg-tint-warning px-4 py-3 text-sm text-ink">
          <span className="font-semibold">Awaiting review.</span> Klimr checks new businesses before they can go live —
          you can keep building the profile meanwhile.
        </div>
      ) : null}

      <div className="mt-6 grid items-start gap-5 lg:grid-cols-[1fr_340px]">
        <div className="space-y-5">
          {canManage ? (
            <form action={updateBusiness} className="rounded-2xl border border-rule bg-surface p-5 shadow-e1">
              <input type="hidden" name="businessId" value={b.id} />
              <input type="hidden" name="sports_present" value="1" />
              <p className="kicker mb-3">Profile</p>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-faint" htmlFor="b-name">Name</label>
                  <input id="b-name" name="name" defaultValue={b.name} minLength={2} maxLength={80} className={`mt-1.5 ${inputCls}`} />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-faint" htmlFor="b-head">Headline</label>
                  <input id="b-head" name="headline" defaultValue={b.headline ?? ""} maxLength={120} className={`mt-1.5 ${inputCls}`} />
                </div>
                <div className="sm:col-span-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-faint" htmlFor="b-bio">About</label>
                  <textarea id="b-bio" name="bio" defaultValue={b.bio ?? ""} maxLength={1200} rows={4} className={`mt-1.5 ${inputCls}`} />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-faint" htmlFor="b-web">Website</label>
                  <input id="b-web" name="website" defaultValue={b.website ?? ""} maxLength={160} className={`mt-1.5 ${inputCls}`} />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-faint" htmlFor="b-mail">Contact email</label>
                  <input id="b-mail" name="contact_email" defaultValue={b.contact_email ?? ""} maxLength={160} className={`mt-1.5 ${inputCls}`} />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-faint" htmlFor="b-phone">Phone</label>
                  <input id="b-phone" name="phone" defaultValue={b.phone ?? ""} maxLength={40} className={`mt-1.5 ${inputCls}`} />
                </div>
                <div>
                  <label className="text-xs font-bold uppercase tracking-wider text-faint" htmlFor="b-area">Area</label>
                  <input id="b-area" name="area_text" defaultValue={b.area_text ?? ""} maxLength={80} className={`mt-1.5 ${inputCls}`} />
                </div>
                <div className="sm:col-span-2">
                  <p className="text-xs font-bold uppercase tracking-wider text-faint">Sports</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    {SPORT_KEYS.map((s) => (
                      <label key={s} className="flex cursor-pointer items-center gap-1.5 rounded-full border border-rule bg-surface px-3 py-1.5 text-sm text-ink transition-colors has-[:checked]:border-brand has-[:checked]:bg-tint-brand/50">
                        <input type="checkbox" name={`sport_${s}`} defaultChecked={b.sports.includes(s)} className="accent-[var(--color-brand)]" />
                        <SportIcon sport={s} variant="badge" size={15} /> {sportMeta(s).name}
                      </label>
                    ))}
                  </div>
                </div>
              </div>
              <button className="press mt-4 rounded-full bg-ink px-5 py-2 text-sm font-semibold text-cream hover:opacity-90">
                Save changes
              </button>
            </form>
          ) : (
            <div className="rounded-2xl border border-rule bg-surface p-5 text-sm text-mute shadow-e1">
              You&rsquo;re {myRole ?? "not a member"} here — only owners and managers can edit.
            </div>
          )}

          <div className="rounded-2xl border border-rule bg-surface p-5 shadow-e1">
            <p className="kicker mb-2 flex items-center gap-1.5"><Handshake size={14} /> Sponsorships</p>
            {!sponsorReady ? (
              openApp ? (
                <div className="rounded-xl border border-brand/40 bg-tint-brand/40 p-3.5">
                  <p className="text-sm font-semibold text-ink">Tier-2 review in progress</p>
                  <p className="mt-0.5 text-[12.5px] text-mute">
                    {(openApp.docs as { name: string }[] | null)?.length ?? 0} document
                    {((openApp.docs as { name: string }[] | null)?.length ?? 0) === 1 ? "" : "s"} · {openApp.domain} — submitted{" "}
                    {new Date(openApp.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}. Review
                    usually lands within a few days.
                  </p>
                  {canManage ? (
                    <form action={withdrawTierApplication} className="mt-2">
                      <input type="hidden" name="applicationId" value={openApp.id} />
                      <input type="hidden" name="businessId" value={b.id} />
                      <button className="press text-[10px] font-bold uppercase tracking-wide text-faint hover:text-danger">
                        Withdraw application
                      </button>
                    </form>
                  ) : null}
                </div>
              ) : canManage && b.status === "active" ? (
                <TierApplication businessId={b.id} />
              ) : (
                <p className="text-sm text-mute">
                  Sponsoring needs the <span className="font-semibold text-ink">Sponsor-ready</span> tier — document
                  review, domain, brand kit, and terms.
                  {b.status !== "active" ? " Available once the business passes its first review." : ""}
                </p>
              )
            ) : canManage ? (
              <SponsorshipProposer businessId={b.id} />
            ) : null}
            {(sponsorships ?? []).length === 0 ? (
              <p className="mt-2 text-sm text-faint">No sponsorships yet.</p>
            ) : (
              <ul className="mt-2 space-y-1.5">
                {((sponsorships ?? []) as { id: string; target_kind: string; label: string; status: string; amount_cents: number | null }[]).map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-2 rounded-xl border border-rule bg-bg px-3 py-2 text-sm">
                    <span className="min-w-0 truncate text-ink">
                      <span className="font-semibold capitalize">{s.target_kind}</span> · {s.label}
                      {s.amount_cents != null ? <span className="text-mute"> · ${(s.amount_cents / 100).toLocaleString("en-US")}</span> : null}
                    </span>
                    <span className="flex shrink-0 items-center gap-2">
                      <span className="text-xs font-semibold text-mute">{SPONSORSHIP_STATUS_LABEL[s.status] ?? s.status}</span>
                      {s.status === "pending" && canManage ? (
                        <form action={withdrawSponsorship}>
                          <input type="hidden" name="sponsorshipId" value={s.id} />
                          <input type="hidden" name="businessId" value={b.id} />
                          <button className="press text-[10px] font-bold uppercase tracking-wide text-faint hover:text-danger">
                            Withdraw
                          </button>
                        </form>
                      ) : null}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        <aside className="space-y-4">
          {canManage ? (
            <div className="rounded-2xl border border-rule bg-surface p-4 shadow-e1">
              <p className="kicker mb-2 flex items-center gap-1.5"><BadgeCheck size={14} /> Listing</p>
              <p className="text-sm text-mute">
                {b.published ? "Listed — visible wherever businesses appear." : "Unlisted — only members can see this profile."}
                {draft ? " Listing takes effect once the review approves this business." : ""}
              </p>
              <form action={setBusinessPublished} className="mt-3">
                <input type="hidden" name="businessId" value={b.id} />
                <input type="hidden" name="published" value={b.published ? "false" : "true"} />
                <button className="press rounded-full border border-rule bg-surface px-4 py-2 text-sm font-semibold text-ink hover:border-faint">
                  {b.published ? "Unlist" : "List this business"}
                </button>
              </form>
            </div>
          ) : null}

          {activeSpons.length ? (
            <div className="rounded-2xl border border-rule bg-surface p-4 shadow-e1">
              <p className="kicker mb-2 flex items-center gap-1.5"><TrendingUp size={14} /> Verified reach</p>
              {reachBucket ? (
                <p className="font-display text-3xl font-bold text-ink">{reachBucket}</p>
              ) : (
                <p className="text-sm text-mute">Growing — milestones appear from 100 verified.</p>
              )}
              <p className="mt-1 text-[11.5px] leading-snug text-mute">
                People verified at your sponsored events — court-checked, not claimed. Klimr shows milestones, not raw counts.
              </p>
              {reachRows.some((r) => r.bucket) ? (
                <ul className="mt-2.5 space-y-1 border-t border-rule pt-2.5">
                  {reachRows.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-2 text-xs">
                      <span className="min-w-0 truncate capitalize text-mute">{r.kindLabelText}</span>
                      <span className="shrink-0 font-mono font-bold text-ink">{r.bucket ?? "—"}</span>
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-2xl border border-rule bg-surface p-4 shadow-e1">
            <p className="kicker mb-2 flex items-center gap-1.5"><Users size={14} /> Team · {members.length}</p>
            <ul className="space-y-1.5">
              {members.map((m) => (
                <li key={m.user_id} className="flex items-center justify-between gap-2 text-sm">
                  <Link href={`/profile/${m.user_id}`} className="min-w-0 truncate font-semibold text-ink hover:text-brand-deep">
                    {names.get(m.user_id) ?? "Member"}
                  </Link>
                  <span className="shrink-0 text-xs font-semibold uppercase tracking-wide text-faint">{m.role}</span>
                </li>
              ))}
            </ul>
            <p className="mt-2.5 text-[11.5px] text-faint">Inviting teammates lands here soon.</p>
          </div>
        </aside>
      </div>
    </div>
  );
}
