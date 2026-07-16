import { createAdminClient } from "@/lib/supabase/admin";
import { SportIcon } from "@/components/sport-icons";
import { requireAdmin, atLeast } from "@/lib/admin";
import { sportMeta } from "@/lib/sports";
import { suspendTournament, restoreTournament } from "../actions";
import { AdminDeleteTournamentButton } from "@/components/admin-delete-tournament-button";

export const metadata = { title: "Tournaments · Admin" };

type Row = {
  id: string;
  code: string;
  title: string;
  sport_key: string;
  status: string;
  owner_id: string;
  suspended_at: string | null;
  suspended_reason: string | null;
  created_at: string;
};
type Prof = { id: string; display_name: string };

const STATUS_TONE: Record<string, string> = {
  draft: "var(--color-mute)",
  published: "#0e7490",
  registration_open: "var(--color-success)",
  registration_closed: "var(--color-warning)",
  in_progress: "var(--color-info)",
  completed: "var(--color-success)",
  archived: "var(--color-mute)",
  cancelled: "var(--color-brand-deep)",
};

export default async function AdminTournaments() {
  const { role } = await requireAdmin("support");
  const canDelete = atLeast(role, "admin");
  const admin = createAdminClient();

  const { data: rows } = await admin
    .from("tournaments")
    .select("id, code, title, sport_key, status, owner_id, suspended_at, suspended_reason, created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  const tournaments = (rows as Row[] | null) ?? [];

  const ids = [...new Set(tournaments.map((t) => t.owner_id))];
  const profMap = new Map<string, Prof>();
  if (ids.length) {
    const { data: profs } = await admin.from("profiles").select("id, display_name").in("id", ids);
    for (const p of (profs as Prof[] | null) ?? []) profMap.set(p.id, p);
  }
  const ownerOf = (id: string) => profMap.get(id)?.display_name || "Unknown";
  const suspendedCount = tournaments.filter((t) => t.suspended_at).length;

  return (
    <div>
      <p className="mb-4 text-sm text-mute">
        {tournaments.length} most recent · {suspendedCount} suspended. Suspending hides an event&rsquo;s public page for review; the organizer keeps their workspace and sees a banner. Deletion is permanent.
      </p>

      {tournaments.length === 0 ? (
        <div className="rounded-2xl border border-rule bg-surface shadow-e1 p-10 text-center text-sm text-mute">No tournaments yet.</div>
      ) : (
        <div className="space-y-3">
          {tournaments.map((t) => {
            const meta = sportMeta(t.sport_key);
            const suspended = !!t.suspended_at;
            const isPublic = !["draft", "cancelled"].includes(t.status) && !suspended;
            return (
              <div key={t.id} className={`rounded-2xl border p-5 ${suspended ? "border-brand/40 bg-tint-brand/30" : "border-rule bg-surface"}`}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <SportIcon sport={t.sport_key} variant="glyph" size={22} />
                      <span className="font-display text-lg text-ink">{t.title}</span>
                      <span className="kicker rounded-full px-2 py-0.5 text-[9px]" style={{ background: "var(--color-bg)", color: STATUS_TONE[t.status] ?? "var(--color-mute)" }}>
                        {t.status}
                      </span>
                      {suspended ? <span className="kicker rounded-full bg-brand px-2 py-0.5 text-[9px] text-white">Suspended</span> : null}
                    </div>
                    <p className="mt-1 text-sm text-mute">
                      {meta.name} · by {ownerOf(t.owner_id)} · {new Date(t.created_at).toLocaleDateString()} · /e/{t.code}
                    </p>
                    {suspended && t.suspended_reason ? <p className="mt-1 text-xs font-medium text-brand-deep">Reason: {t.suspended_reason}</p> : null}
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {isPublic ? (
                      <a href={`/e/${t.code}`} target="_blank" rel="noopener noreferrer" className="text-xs font-semibold text-mute underline-offset-2 hover:text-ink hover:underline">
                        View public
                      </a>
                    ) : null}
                    {suspended ? (
                      <form action={restoreTournament}>
                        <input type="hidden" name="tournamentId" value={t.id} />
                        <button type="submit" className="inline-flex items-center gap-1 rounded-lg border border-rule px-2.5 py-1.5 text-xs font-semibold text-ink transition-colors hover:border-faint">
                          Restore
                        </button>
                      </form>
                    ) : (
                      <form action={suspendTournament} className="flex items-center gap-1.5">
                        <input type="hidden" name="tournamentId" value={t.id} />
                        <input name="reason" placeholder="Reason (optional)" className="w-40 rounded-[10px] border border-rule-2 bg-bg px-2.5 py-1.5 text-xs text-ink outline-none focus:border-brand focus:ring-4 focus:ring-brand/15" />
                        <button type="submit" className="inline-flex items-center gap-1 rounded-lg border border-rule px-2.5 py-1.5 text-xs font-semibold text-mute transition-colors hover:border-brand hover:text-brand-deep">
                          Suspend
                        </button>
                      </form>
                    )}
                    {canDelete ? <AdminDeleteTournamentButton id={t.id} title={t.title} /> : null}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
