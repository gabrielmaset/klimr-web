import { GraduationCap, ExternalLink } from "lucide-react";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";
import { roleLabel } from "@/lib/professional-roles";
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
    .select("id, user_id, role, credential_type, credential_id, credential_jurisdiction, verification_url, headline, bio, applicant_note, created_at")
    .eq("status", "pending")
    .order("created_at", { ascending: true });
  const apps = (pendingApps as AppRow[] | null) ?? [];

  const ids = [...new Set([...rows.map((r) => r.user_id), ...apps.map((a) => a.user_id)])];
  const nameMap = new Map<string, string>();
  if (ids.length) {
    const { data: profs } = await admin.from("profiles").select("id, display_name").in("id", ids);
    (profs ?? []).forEach((p) => nameMap.set(p.id, p.display_name));
  }

  return (
    <div className="space-y-8">
      <section>
        <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-mute">
          Pending applications {apps.length > 0 ? <span className="rounded-full bg-brand px-2 py-0.5 text-[11px] font-bold text-white shadow-md shadow-brand/25">{apps.length}</span> : null}
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
                    <div className="text-[11px] text-faint">{a.user_id}</div>
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
                  </div>
                ) : null}
                {a.applicant_note ? <p className="mt-2 text-xs text-faint">Note: {a.applicant_note}</p> : null}

                <form action={reviewProviderApplication} className="mt-3 flex flex-wrap items-center gap-2">
                  <input type="hidden" name="appId" value={a.id} />
                  <input
                    name="review_note"
                    placeholder="Review note (optional)"
                    className="min-w-[180px] flex-1 rounded-xl border border-rule bg-bg px-3 py-1.5 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
                  />
                  <button name="decision" value="approve" className="press rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep shadow-md shadow-brand/25">
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
              className="w-full rounded-xl border border-rule bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-semibold text-mute">Headline (optional)</span>
            <input
              name="headline"
              placeholder="e.g. USPTA-certified tennis coach"
              className="w-full rounded-xl border border-rule bg-bg px-3 py-2 text-sm text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15"
            />
          </label>
          <input type="hidden" name="action" value="approve" />
          <button className="press h-[38px] rounded-full bg-brand px-5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep shadow-md shadow-brand/25">
            Approve
          </button>
        </form>
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
