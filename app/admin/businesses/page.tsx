import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";
import { reviewBusiness, setBusinessTier, decideTierApplication } from "../actions";
import { kindLabel, TIER_LABEL } from "@/lib/business";

export const metadata = { title: "Businesses · Admin" };
export const dynamic = "force-dynamic";

type BizRow = {
  id: string;
  kind: string;
  name: string;
  slug: string;
  owner_id: string;
  headline: string | null;
  area_text: string | null;
  sports: string[];
  category: string | null;
  verification_level: string;
  status: string;
  published: boolean;
  created_at: string;
};

const STATUSES = ["draft", "active", "suspended"] as const;
const TIER_TONE: Record<string, string> = {
  none: "var(--color-mute)",
  tier1: "var(--color-success)",
  tier2: "var(--color-brand-deep)",
};

function fmt(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export default async function AdminBusinesses({ searchParams }: { searchParams: Promise<{ status?: string }> }) {
  await requireAdmin("admin");
  const admin = createAdminClient();
  const sp = await searchParams;
  const status = (STATUSES as readonly string[]).includes(sp.status ?? "") ? (sp.status as string) : "draft";

  const [{ data: rows }, counts, { data: openApps }] = await Promise.all([
    admin
      .from("business_accounts")
      .select("id, kind, name, slug, owner_id, headline, area_text, sports, category, verification_level, status, published, created_at")
      .eq("status", status)
      .order("created_at", { ascending: false })
      .limit(60),
    Promise.all(
      STATUSES.map(async (s) => {
        const r = await admin.from("business_accounts").select("*", { count: "exact", head: true }).eq("status", s);
        return [s, r.count ?? 0] as const;
      }),
    ),
    admin
      .from("business_tier_applications")
      .select("id, business_id, domain, notes, docs, created_at")
      .eq("status", "submitted")
      .order("created_at", { ascending: true })
      .limit(60),
  ]);
  const countOf = new Map(counts);
  const list = (rows ?? []) as BizRow[];
  type AppRow = { id: string; business_id: string; domain: string; notes: string | null; docs: { path: string; name: string; size: number }[]; created_at: string };
  const appByBiz = new Map(((openApps ?? []) as AppRow[]).map((a) => [a.business_id, a]));
  const docUrl = new Map<string, string>();
  const allDocPaths = [...appByBiz.values()].flatMap((a) => (a.docs ?? []).map((d) => d.path));
  if (allDocPaths.length) {
    const signedAll = await Promise.all(
      allDocPaths.map((path) => admin.storage.from("business-docs").createSignedUrl(path, 3600).then((r) => ({ path, url: r.data?.signedUrl }))),
    );
    for (const s of signedAll) if (s.url) docUrl.set(s.path, s.url);
  }

  const ownerIds = [...new Set(list.map((b) => b.owner_id))];
  const names = new Map<string, string>();
  if (ownerIds.length) {
    const { data: profs } = await admin.from("profiles").select("id, display_name").in("id", ownerIds);
    for (const p of (profs ?? []) as { id: string; display_name: string }[]) names.set(p.id, p.display_name);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-ink">Businesses</h1>
        <p className="mt-1 text-sm text-mute">
          Review drafts before they can list; grant tiers after checks. Tier 2 (sponsor-ready) = the no-payments review:
          documents, domain, brand kit, terms. Status and tier move only through here — the database refuses everyone else.
        </p>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {STATUSES.map((s) => (
          <Link
            key={s}
            href={`/admin/businesses?status=${s}`}
            className={`press rounded-full border px-3.5 py-1.5 text-sm font-semibold capitalize transition-colors ${
              s === status ? "border-ink bg-ink text-cream" : "border-rule bg-surface text-ink hover:border-faint"
            }`}
          >
            {s} · {countOf.get(s) ?? 0}
          </Link>
        ))}
      </div>

      {list.length === 0 ? (
        <p className="rounded-2xl border border-rule bg-surface p-8 text-center text-sm text-mute shadow-e1">
          Nothing {status} right now.
        </p>
      ) : (
        <div className="space-y-3">
          {list.map((b) => (
            <div key={b.id} className="rounded-2xl border border-rule bg-surface p-5 shadow-e1">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-lg text-ink">{b.name}</span>
                    <span className="rounded-full bg-bg px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide text-mute">
                      {kindLabel(b.kind)}
                    </span>
                    <span
                      className="rounded-full bg-bg px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide"
                      style={{ color: TIER_TONE[b.verification_level] }}
                    >
                      {TIER_LABEL[b.verification_level] ?? b.verification_level}
                    </span>
                    {b.published ? (
                      <span className="rounded-full bg-tint-success px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide text-success">
                        Listed
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-sm text-mute">
                    Owner{" "}
                    <Link href={`/admin/users/${b.owner_id}`} className="font-semibold text-ink hover:text-brand-deep">
                      {names.get(b.owner_id) ?? "Unknown"}
                    </Link>
                    {" · "}created {fmt(b.created_at)}
                    {b.area_text ? ` · ${b.area_text}` : ""}
                    {b.sports.length ? ` · ${b.sports.join(", ")}` : ""}
                    {b.category ? ` · category: ${b.category}` : ""}
                  </p>
                  {b.headline ? <p className="mt-1.5 max-w-2xl text-sm text-ink">{b.headline}</p> : null}
                </div>

                <span className="flex shrink-0 flex-wrap items-center gap-1.5">
                  {b.status === "draft" ? (
                    <form action={reviewBusiness}>
                      <input type="hidden" name="businessId" value={b.id} />
                      <input type="hidden" name="decision" value="activate" />
                      <button className="press rounded-full bg-success px-3.5 py-1.5 text-xs font-semibold text-white hover:brightness-95">
                        Approve
                      </button>
                    </form>
                  ) : null}
                  {b.status === "active" ? (
                    <form action={reviewBusiness}>
                      <input type="hidden" name="businessId" value={b.id} />
                      <input type="hidden" name="decision" value="suspend" />
                      <button className="press rounded-full border border-danger/40 px-3.5 py-1.5 text-xs font-semibold text-danger hover:bg-tint">
                        Suspend
                      </button>
                    </form>
                  ) : null}
                  {b.status === "suspended" ? (
                    <form action={reviewBusiness}>
                      <input type="hidden" name="businessId" value={b.id} />
                      <input type="hidden" name="decision" value="reactivate" />
                      <button className="press rounded-full border border-rule px-3.5 py-1.5 text-xs font-semibold text-ink hover:border-faint">
                        Reactivate
                      </button>
                    </form>
                  ) : null}
                </span>
              </div>

              {appByBiz.has(b.id) ? (
                <div className="mt-4 rounded-xl border border-brand/40 bg-tint-brand/30 p-3.5">
                  <p className="text-xs font-bold uppercase tracking-wider text-brand-deep">Tier-2 application</p>
                  <p className="mt-1 text-sm text-ink">
                    Domain <span className="font-semibold">{appByBiz.get(b.id)!.domain}</span>
                    {appByBiz.get(b.id)!.notes ? <span className="text-mute"> — {appByBiz.get(b.id)!.notes}</span> : null}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    {(appByBiz.get(b.id)!.docs ?? []).map((d) => (
                      <a
                        key={d.path}
                        href={docUrl.get(d.path) ?? "#"}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="press rounded-full border border-rule bg-surface px-2.5 py-1 text-xs font-semibold text-ink hover:border-faint"
                      >
                        {d.name}
                      </a>
                    ))}
                  </div>
                  <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
                    <form action={decideTierApplication} className="flex items-center gap-1.5">
                      <input type="hidden" name="applicationId" value={appByBiz.get(b.id)!.id} />
                      <input type="hidden" name="decision" value="approved" />
                      <button className="press rounded-full bg-success px-3.5 py-1.5 text-xs font-semibold text-white hover:brightness-95">
                        Approve → Sponsor-ready
                      </button>
                    </form>
                    <form action={decideTierApplication} className="flex items-center gap-1.5">
                      <input type="hidden" name="applicationId" value={appByBiz.get(b.id)!.id} />
                      <input type="hidden" name="decision" value="rejected" />
                      <input
                        name="note"
                        maxLength={200}
                        placeholder="Reason (sent to the owner)"
                        className="rounded-[10px] border border-rule-2 bg-surface px-3 py-1.5 text-xs text-ink outline-none placeholder:text-faint focus:border-brand"
                      />
                      <button className="press rounded-full border border-rule px-3 py-1.5 text-xs font-semibold text-ink hover:border-faint">
                        Reject
                      </button>
                    </form>
                  </div>
                </div>
              ) : null}

              <form action={setBusinessTier} className="mt-4 flex flex-wrap items-center gap-2 border-t border-rule pt-3">
                <input type="hidden" name="businessId" value={b.id} />
                <label className="text-xs font-bold uppercase tracking-wider text-faint">Tier</label>
                <select
                  name="tier"
                  defaultValue={b.verification_level}
                  className="rounded-[10px] border border-rule-2 bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
                >
                  <option value="none">Unverified</option>
                  <option value="tier1">Verified (Tier 1)</option>
                  <option value="tier2">Sponsor-ready (Tier 2)</option>
                </select>
                <input
                  name="note"
                  maxLength={200}
                  placeholder="Review note (kept in the admin log)"
                  className="min-w-[220px] flex-1 rounded-[10px] border border-rule-2 bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/15"
                />
                <button className="press rounded-full bg-ink px-3.5 py-1.5 text-xs font-semibold text-cream hover:opacity-90">
                  Apply tier
                </button>
              </form>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
