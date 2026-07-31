import Link from "next/link";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdmin } from "@/lib/admin";
import { updateSuggestionStatus } from "@/app/admin/actions";
import { ExternalLink, MapPin } from "lucide-react";

export const dynamic = "force-dynamic";

/** Court suggestions review queue: verify a member's submission (maps link
 *  is one click), then add the court through the normal finder ingestion
 *  and mark the suggestion reviewed — or reject with a note to self. */
export default async function CourtSuggestionsAdminPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAdmin();
  const admin = createAdminClient();
  const sp = await searchParams;
  const raw = Array.isArray(sp.status) ? sp.status[0] : sp.status;
  const status = ["pending", "reviewed", "rejected"].includes(raw ?? "") ? (raw as string) : "pending";

  const { data: rows } = await admin
    .from("court_suggestions")
    .select("id, user_id, name, address, phone, website_url, maps_url, notes, sports, status, created_at")
    .eq("status", status)
    .order("created_at", { ascending: false })
    .limit(100);
  const list = rows ?? [];

  const names = new Map<string, string>();
  const uids = [...new Set(list.map((r) => r.user_id))];
  if (uids.length) {
    const { data: profs } = await admin.from("profiles").select("id, display_name").in("id", uids);
    for (const p of profs ?? []) names.set(p.id, p.display_name || "Member");
  }

  const fmt = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <p className="kicker text-brand-deep">Admin — Courts</p>
      <h1 className="mt-1 font-display text-3xl font-bold text-ink">Court suggestions</h1>
      <p className="mt-1 text-sm text-mute">Member-submitted courts awaiting verification. Confirm via the maps link, add through the finder, then mark reviewed.</p>

      <div className="mt-5 flex gap-2">
        {["pending", "reviewed", "rejected"].map((s) => (
          <Link key={s} href={`/admin/court-suggestions?status=${s}`} className={`rounded-[9px] border px-3 py-1.5 text-xs font-bold capitalize ${s === status ? "border-ink bg-ink text-white" : "border-rule-2 bg-surface text-mute hover:border-ink"}`}>
            {s}
          </Link>
        ))}
      </div>

      <div className="mt-4 space-y-3">
        {list.length === 0 ? (
          <p className="rounded-2xl border border-rule bg-surface px-4 py-10 text-center text-sm text-mute">Nothing {status} right now.</p>
        ) : (
          list.map((r) => (
            <div key={r.id} className="rounded-2xl border border-rule bg-surface p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-display text-lg font-bold text-ink">{r.name}</p>
                  <p className="mt-0.5 flex items-center gap-1.5 text-sm text-mute"><MapPin size={13} className="shrink-0 text-faint" /> {r.address}</p>
                  <p className="mt-1 text-xs text-faint">by {names.get(r.user_id) ?? "Member"} · {fmt(r.created_at)}{r.phone ? ` · ${r.phone}` : ""}</p>
                  {r.sports?.length ? (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {r.sports.map((k) => (
                        <span key={k} className="rounded-md bg-bg px-2 py-0.5 font-mono text-[10.5px] uppercase tracking-wide text-mute">{k.replace("_", " ")}</span>
                      ))}
                    </div>
                  ) : null}
                  {r.notes ? <p className="mt-2 max-w-xl text-sm text-ink-soft">{r.notes}</p> : null}
                  <div className="mt-2 flex gap-3">
                    {r.maps_url ? (
                      <a href={r.maps_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-deep hover:underline">Open in Maps <ExternalLink size={11} /></a>
                    ) : null}
                    {r.website_url ? (
                      <a href={r.website_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-brand-deep hover:underline">Website <ExternalLink size={11} /></a>
                    ) : null}
                  </div>
                </div>
                {status === "pending" ? (
                  <div className="flex shrink-0 gap-2">
                    <form action={updateSuggestionStatus}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="status" value="reviewed" />
                      <button className="press rounded-[9px] bg-ink px-3 py-2 text-xs font-bold text-white hover:bg-[#2A2622]">Mark reviewed</button>
                    </form>
                    <form action={updateSuggestionStatus}>
                      <input type="hidden" name="id" value={r.id} />
                      <input type="hidden" name="status" value="rejected" />
                      <button className="press rounded-[9px] border border-rule-2 bg-surface px-3 py-2 text-xs font-bold text-mute hover:border-ink hover:text-ink">Reject</button>
                    </form>
                  </div>
                ) : null}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
