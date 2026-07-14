import { GraduationCap, ExternalLink } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";
import { roleLabel, PROFESSIONAL_ROLES } from "@/lib/professional-roles";
import { setClassProvider, reviewProviderApplication } from "../actions";

export const metadata = { title: "Providers · Admin" };

type ProviderRow = { user_id: string; status: string; headline: string | null; approved_at: string };
type AppRow = {
  id: string;
  user_id: string;
  role: string;
  credential_type: string | null;
  credential_id: string | null;
  credential_jurisdiction: string | null;
  verification_url: string | null;
  headline: string | null;
  bio: string | null;
  applicant_note: string | null;
  created_at: string;
  document_path: string | null;
};
type Ident = { name: string; memberNo: number | null; area: string | null; joined: string };
type DecidedRow = {
  id: string;
  user_id: string;
  role: string;
  status: string;
  review_note: string | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  credential_id: string | null;
};

export default async function AdminProvidersPage() {
  await requireAdmin("admin");
  const admin = createAdminClient();

  const { data: providers } = await admin
    .from("class_providers")
    .select("user_id, status, headline, approved_at")
    .order("approved_at", { ascending: false });
  const rows = (providers as ProviderRow[] | null) ?? [];

  const { data: pendingApps } = await admin
    .from("provider_applications")
    .select("id, user_id, role, credential_type, credential_id, credential_jurisdiction, verification_url, headline, bio, applicant_note, created_at, document_path")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  const apps = (pendingApps as AppRow[] | null) ?? [];

  // Decision history — visible to every admin: what was decided, by whom, when.
  const { data: decidedRows } = await admin
    .from("provider_applications")
    .select("id, user_id, role, status, review_note, reviewed_by, reviewed_at, credential_id")
    .in("status", ["approved", "rejected"])
    .order("reviewed_at", { ascending: false, nullsFirst: false })
    .limit(40);
  const decided = (decidedRows as DecidedRow[] | null) ?? [];

  const ids = [
    ...new Set([
      ...rows.map((r) => r.user_id),
      ...apps.map((a) => a.user_id),
      ...decided.map((d) => d.user_id),
      ...decided.map((d) => d.reviewed_by).filter((x): x is string => !!x),
    ]),
  ];
  const nameMap = new Map<string, string>();
  const identMap = new Map<string, Ident>();
  if (ids.length) {
    const { data: profs } = await admin.from("profiles").select("id, display_name, member_no, city, state, created_at").in("id", ids);
    for (const pr of profs ?? []) {
      nameMap.set(pr.id, pr.display_name);
      identMap.set(pr.id, {
        name: pr.display_name,
        memberNo: pr.member_no,
        area: [pr.city, pr.state].filter(Boolean).join(", ") || null,
        joined: new Date(pr.created_at).toLocaleDateString("en-US", { month: "short", year: "numeric" }),
      });
    }
  }

  // Short-lived signed URLs for applicant documents (private bucket, 0114).
  const docUrls = new Map<string, string>();
  await Promise.all(
    apps
      .filter((a) => a.document_path)
      .map(async (a) => {
        const { data } = await admin.storage.from("credential-docs").createSignedUrl(a.document_path!, 600);
        if (data?.signedUrl) docUrls.set(a.id, data.signedUrl);
      }),
  );
  const memberRef = (m: number | null) => (m != null ? `Member #${String(m).padStart(5, "0")}` : null);

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-mute">
          Pending applications {apps.length > 0 ? <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white">{apps.length}</span> : null}
        </h2>
        {apps.length === 0 ? (
          <div className="rounded-2xl border border-rule bg-surface shadow-e1 p-6 text-center text-sm text-mute">No applications waiting for review.</div>
        ) : (
          <div className="space-y-3">
            {apps.map((a) => (
              <div key={a.id} className="rounded-2xl border border-rule bg-surface shadow-e1 p-5">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold text-ink">{nameMap.get(a.user_id) ?? "User"}</span>
                      <span className="rounded-full bg-tint-brand px-2 py-0.5 text-xs font-semibold text-brand-deep">{roleLabel(a.role)}</span>
                    </div>
                    {a.headline ? <div className="mt-0.5 text-xs text-mute">{a.headline}</div> : null}
                    <div className="mt-0.5 text-xs font-semibold text-ink-soft">
                      {[memberRef(identMap.get(a.user_id)?.memberNo ?? null), identMap.get(a.user_id)?.area, identMap.get(a.user_id) ? `Joined ${identMap.get(a.user_id)!.joined}` : null]
                        .filter(Boolean)
                        .join(" · ")}
                    </div>
                    <div className="font-mono text-[10px] text-faint">Account {a.user_id}</div>
                  </div>
                  <span className="shrink-0 text-[11px] text-faint">{new Date(a.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</span>
                </div>

                {a.bio ? <p className="mt-2 text-sm text-ink-soft">{a.bio}</p> : null}

                {a.credential_id || a.credential_type ? (
                  <div className="mt-3 rounded-xl bg-bg/50 px-3.5 py-2.5 text-xs text-mute">
                    <span className="font-semibold text-ink">Credential:</span> {a.credential_type ?? "—"}
                    {a.credential_id ? ` · #${a.credential_id}` : ""}
                    {a.credential_jurisdiction ? ` · ${a.credential_jurisdiction}` : ""}
                    {a.verification_url ? (
                      <a href={a.verification_url} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 font-semibold text-brand-deep hover:underline">
                        Verify <ExternalLink size={11} />
                      </a>
                    ) : null}
                    {docUrls.get(a.id) ? (
                      <a href={docUrls.get(a.id)} target="_blank" rel="noopener noreferrer" className="ml-2 inline-flex items-center gap-1 rounded-full border border-rule-2 bg-surface px-2 py-0.5 font-semibold text-ink hover:text-brand-deep">
                        View document <ExternalLink size={11} />
                      </a>
                    ) : null}
                  </div>
                ) : null}
                {a.applicant_note ? <p className="mt-2 text-xs text-faint">Note: {a.applicant_note}</p> : null}

                {(() => {
                  const meta = PROFESSIONAL_ROLES.find((r) => r.key === a.role);
                  if (!meta?.verifyUrl) return null;
                  return (
                    <div className="mt-3 rounded-xl border border-[#cfe3d2] bg-[#f2f9f3] p-3 text-xs leading-relaxed text-ink-soft">
                      <p className="font-bold text-[#1f7a33]">
                        Verify at the source:{" "}
                        <a href={meta.verifyUrl} target="_blank" rel="noopener noreferrer" className="underline">
                          {new URL(meta.verifyUrl).hostname}
                        </a>
                      </p>
                      {meta.verifyNote ? <p className="mt-1">{meta.verifyNote}</p> : null}
                      {meta.renewalNote ? <p className="mt-1 text-mute">{meta.renewalNote}</p> : null}
                      <p className="mt-1 text-mute">Applicant-provided links are context only — always confirm at the official registry above.</p>
                    </div>
                  );
                })()}

                <form action={reviewProviderApplication} className="mt-3 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="appId" value={a.id} />
                  <label className="flex items-center gap-1.5 text-xs font-semibold text-ink-soft">
                    Expires
                    <input type="date" name="credential_expires" className="rounded-[10px] border border-rule-2 bg-bg px-2.5 py-1.5 text-sm text-ink outline-none focus:border-brand" />
                  </label>
                  <input
                    name="review_note"
                    placeholder="Review note (optional)"
                    className="min-w-[180px] flex-1 rounded-[10px] border border-rule-2 bg-bg px-3 py-1.5 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
                  />
                  <button name="decision" value="approve" className="press rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep">
                    Approve
                  </button>
                  <button name="decision" value="reject" className="press rounded-full border border-rule px-4 py-1.5 text-sm font-semibold text-mute transition-colors hover:text-brand-deep">
                    Reject
                  </button>
                </form>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="rounded-2xl border border-rule bg-surface shadow-e1 p-5">
        <div className="flex items-center gap-2">
          <GraduationCap size={18} className="text-brand-deep" />
          <h2 className="text-base font-bold text-ink">Approve a class provider</h2>
        </div>
        <p className="mt-1 text-sm text-mute">
          Manual grant — paste the user&rsquo;s ID (from the Users tab) to approve them as a coach directly.
        </p>
        <form action={setClassProvider} className="mt-4 grid gap-3 sm:grid-cols-[1fr_1fr_auto] sm:items-end">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-mute">User ID</span>
            <input
              name="userId"
              required
              placeholder="uuid"
              className="w-full rounded-[10px] border border-rule-2 bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-mute">Headline (optional)</span>
            <input
              name="headline"
              placeholder="e.g. USPTA-certified tennis coach"
              className="w-full rounded-[10px] border border-rule-2 bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
            />
          </label>
          <input type="hidden" name="action" value="approve" />
          <button className="press h-[38px] rounded-full bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep">
            Approve
          </button>
        </form>
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-mute">Decision history ({decided.length})</h2>
        {decided.length === 0 ? (
          <div className="rounded-2xl border border-rule bg-surface shadow-e1 p-6 text-center text-sm text-mute">No decisions yet — approved and rejected applications will appear here for every admin.</div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-rule bg-surface shadow-e1">
            <div className="divide-y divide-rule-soft">
              {decided.map((d) => (
                <div key={d.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
                  <span
                    className={`rounded-full px-2 py-0.5 font-mono text-[9px] font-bold uppercase tracking-wide ${d.status === "approved" ? "bg-[#EFF8F0] text-[#217A34]" : "bg-[#FDECEA] text-[#D92D20]"}`}
                  >
                    {d.status}
                  </span>
                  <span className="text-sm font-bold text-ink">{nameMap.get(d.user_id) ?? d.user_id.slice(0, 8)}</span>
                  <span className="rounded-full bg-tint-brand px-2 py-0.5 text-[11px] font-semibold text-brand-deep">{roleLabel(d.role)}</span>
                  {d.credential_id ? <span className="font-mono text-[11px] text-faint">#{d.credential_id}</span> : null}
                  <span className="ml-auto text-[11px] text-faint">
                    by <span className="font-semibold text-ink-soft">{d.reviewed_by ? nameMap.get(d.reviewed_by) ?? "an admin" : "an admin"}</span>
                    {d.reviewed_at ? ` · ${new Date(d.reviewed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}` : ""}
                  </span>
                  {d.review_note ? <span className="w-full text-xs italic text-mute">&ldquo;{d.review_note}&rdquo;</span> : null}
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-semibold text-mute">Providers ({rows.length})</h2>
        {rows.length === 0 ? (
          <div className="rounded-2xl border border-rule bg-surface shadow-e1 p-8 text-center text-sm text-mute">No providers yet.</div>
        ) : (
          <div className="overflow-hidden rounded-2xl border border-rule bg-surface shadow-e1">
            <table className="w-full text-sm">
              <thead className="border-b border-rule bg-bg/50 text-left text-xs text-mute">
                <tr>
                  <th className="px-4 py-2.5 font-semibold">Coach</th>
                  <th className="px-4 py-2.5 font-semibold">Headline</th>
                  <th className="px-4 py-2.5 font-semibold">Status</th>
                  <th className="px-4 py-2.5 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-rule/60">
                {rows.map((r) => (
                  <tr key={r.user_id}>
                    <td className="px-4 py-3">
                      <div className="font-semibold text-ink">{nameMap.get(r.user_id) ?? "—"}</div>
                      <div className="text-[11px] text-faint">{r.user_id}</div>
                    </td>
                    <td className="px-4 py-3 text-mute">{r.headline ?? "—"}</td>
                    <td className="px-4 py-3">
                      <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${r.status === "approved" ? "bg-success/10 text-success" : "bg-rule/50 text-mute"}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <form action={setClassProvider} className="inline">
                        <input type="hidden" name="userId" value={r.user_id} />
                        <input type="hidden" name="action" value={r.status === "approved" ? "revoke" : "approve"} />
                        <button className="press rounded-full border border-rule px-3 py-1.5 text-xs font-semibold text-ink transition-colors hover:bg-bg">
                          {r.status === "approved" ? "Revoke" : "Re-approve"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
