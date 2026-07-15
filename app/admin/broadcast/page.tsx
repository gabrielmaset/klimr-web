import type { Metadata } from "next";
import { requireAdmin } from "@/lib/admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { BroadcastForm } from "./broadcast-form";

export const metadata: Metadata = { title: "Broadcast · Admin" };

export default async function AdminBroadcastPage() {
  await requireAdmin("admin");
  const admin = createAdminClient();
  const { data: history } = await admin
    .from("broadcasts")
    .select("id, subject, audience, recipient_count, created_at, sent_by")
    .order("created_at", { ascending: false })
    .limit(12);
  const senderIds = [...new Set((history ?? []).map((b) => b.sent_by).filter((x): x is string => !!x))];
  const names = new Map<string, string>();
  if (senderIds.length) {
    const { data: profs } = await admin.from("profiles").select("id, display_name").in("id", senderIds);
    for (const p of profs ?? []) names.set(p.id, p.display_name);
  }
  const audLabel = (a: unknown) => {
    const v = (a as { audience?: string } | null)?.audience ?? "all";
    return { all: "All members", organizers: "Organizers", tournament_directors: "Tournament Directors", providers: "Verified pros" }[v] ?? v;
  };

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <p className="kicker text-brand-deep">Admin</p>
      <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Broadcast</h1>
      <p className="mt-2 max-w-xl text-sm text-mute">
        Service announcements to members — rule changes, policy updates, important notices. Sends go out one by one through the standard
        email pipeline and are logged below.
      </p>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]">
        <BroadcastForm />
        <section>
          <h2 className="mb-3 text-sm font-semibold text-mute">Sent ({history?.length ?? 0})</h2>
          {!history?.length ? (
            <div className="rounded-2xl border border-rule bg-surface p-6 text-center text-sm text-mute shadow-e1">No broadcasts yet.</div>
          ) : (
            <div className="overflow-hidden rounded-2xl border border-rule bg-surface shadow-e1">
              <div className="divide-y divide-rule-soft">
                {history.map((b) => (
                  <div key={b.id} className="px-4 py-3">
                    <p className="text-sm font-bold text-ink">{b.subject}</p>
                    <p className="mt-0.5 text-[11px] text-faint">
                      {audLabel(b.audience)} · {b.recipient_count} recipients · by {b.sent_by ? names.get(b.sent_by) ?? "an admin" : "an admin"} ·{" "}
                      {new Date(b.created_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
