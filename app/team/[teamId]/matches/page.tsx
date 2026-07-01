import { redirect } from "next/navigation";
import { CalendarClock, Trophy, MapPin, Swords, Inbox, Clock } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { ChallengePanel, MatchActions } from "./match-tools";

type TM = {
  id: string;
  home_team_id: string;
  away_team_id: string;
  scheduled_at: string | null;
  location_text: string | null;
  status: string;
  home_score: number | null;
  away_score: number | null;
  winner_team_id: string | null;
  note: string | null;
  created_at: string;
};

function fmtWhen(iso: string | null) {
  if (!iso) return "Time TBD";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }) + " · " + d.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
}

export default async function TeamMatches({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/team/${teamId}/matches`);

  const { data: team } = await supabase.from("teams").select("id, name, sport_key").eq("id", teamId).maybeSingle();
  if (!team) redirect("/teams");
  const meta = sportMeta(team.sport_key);

  const { data: membership } = await supabase.from("team_members").select("role").eq("team_id", teamId).eq("user_id", user.id).maybeSingle();
  const canManage = !!membership?.role && ["owner", "manager", "staff"].includes(membership.role);

  const { data: rawMatches } = await supabase
    .from("team_matches")
    .select("id, home_team_id, away_team_id, scheduled_at, location_text, status, home_score, away_score, winner_team_id, note, created_at")
    .or(`home_team_id.eq.${teamId},away_team_id.eq.${teamId}`);
  const matches = (rawMatches as TM[] | null) ?? [];

  // Resolve names of every involved team.
  const ids = [...new Set(matches.flatMap((m) => [m.home_team_id, m.away_team_id]))];
  const { data: teamRows } = ids.length ? await supabase.from("teams").select("id, name").in("id", ids) : { data: [] as { id: string; name: string }[] };
  const nameById = new Map((teamRows ?? []).map((t) => [t.id, t.name]));
  nameById.set(team.id, team.name);
  const nameOf = (id: string) => nameById.get(id) ?? "A team";

  // Opponent candidates for a new challenge: other Pro teams, same sport.
  let opponents: { id: string; name: string }[] = [];
  if (canManage) {
    const { data: opp } = await supabase
      .from("teams")
      .select("id, name")
      .eq("category", "pro")
      .eq("sport_key", team.sport_key)
      .is("deleted_at", null)
      .neq("id", teamId)
      .order("name")
      .limit(100);
    opponents = (opp ?? []).map((t) => ({ id: t.id, name: t.name }));
  }

  const byTime = (a: TM, b: TM) => (a.scheduled_at ?? a.created_at).localeCompare(b.scheduled_at ?? b.created_at);
  const incoming = matches.filter((m) => m.status === "proposed" && m.away_team_id === teamId).sort(byTime);
  const outgoing = matches.filter((m) => m.status === "proposed" && m.home_team_id === teamId).sort(byTime);
  const upcoming = matches.filter((m) => m.status === "scheduled").sort(byTime);
  const results = matches.filter((m) => m.status === "completed").sort((a, b) => (b.scheduled_at ?? b.created_at).localeCompare(a.scheduled_at ?? a.created_at));

  let wins = 0, losses = 0, draws = 0;
  for (const m of results) {
    if (m.winner_team_id === null) draws++;
    else if (m.winner_team_id === teamId) wins++;
    else losses++;
  }

  function MatchCard({ m, actionable }: { m: TM; actionable: boolean }) {
    const opponentId = m.home_team_id === teamId ? m.away_team_id : m.home_team_id;
    const completed = m.status === "completed";
    const outcome = m.winner_team_id === null ? "draw" : m.winner_team_id === teamId ? "win" : "loss";
    const oc = outcome === "win" ? { t: "Win", bg: "var(--color-tint-success)", fg: "var(--color-success)" } : outcome === "loss" ? { t: "Loss", bg: "#fef2f2", fg: "#b91c1c" } : { t: "Draw", bg: "#f4f4f5", fg: "#71717a" };
    return (
      <div className="rounded-2xl border border-rule bg-surface p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-bg text-lg" aria-hidden>{meta.emoji}</span>
              <div className="min-w-0">
                <p className="truncate text-sm font-bold text-ink">
                  {m.home_team_id === teamId ? "vs " : "at "}{nameOf(opponentId)}
                </p>
                <p className="text-xs text-mute">{m.home_team_id === teamId ? "Home" : "Away"} · {meta.name}</p>
              </div>
            </div>
          </div>
          {completed ? (
            <span className="shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-bold" style={{ background: oc.bg, color: oc.fg }}>{oc.t}</span>
          ) : m.status === "scheduled" ? (
            <span className="shrink-0 rounded-full bg-tint-brand px-2.5 py-0.5 text-[11px] font-bold text-brand-deep">Scheduled</span>
          ) : (
            <span className="shrink-0 rounded-full bg-[#fff7ed] px-2.5 py-0.5 text-[11px] font-bold text-[#c2410c]">Pending</span>
          )}
        </div>

        {completed ? (
          <div className="mt-3 flex items-center gap-3 rounded-xl bg-bg px-3 py-2">
            <span className="text-xs text-mute">{nameOf(m.home_team_id)}</span>
            <span className="font-display text-xl text-ink">{m.home_score}<span className="mx-1.5 text-faint">–</span>{m.away_score}</span>
            <span className="text-xs text-mute">{nameOf(m.away_team_id)}</span>
          </div>
        ) : (
          <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-mute">
            <span className="inline-flex items-center gap-1.5"><CalendarClock size={13} className="text-faint" /> {fmtWhen(m.scheduled_at)}</span>
            {m.location_text ? <span className="inline-flex items-center gap-1.5"><MapPin size={13} className="text-faint" /> {m.location_text}</span> : null}
          </div>
        )}

        {m.note && !completed ? <p className="mt-2 text-xs text-ink-soft">&ldquo;{m.note}&rdquo;</p> : null}

        {actionable && canManage ? (
          <MatchActions
            match={{ id: m.id, status: m.status, homeTeamId: m.home_team_id, awayTeamId: m.away_team_id, homeName: nameOf(m.home_team_id), awayName: nameOf(m.away_team_id) }}
            teamId={teamId}
          />
        ) : null}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <p className="kicker mb-1 text-brand-deep">Matches</p>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">{team.name}</h1>
        {results.length > 0 ? (
          <div className="flex items-center gap-2 text-sm">
            <Trophy size={16} className="text-pop" />
            <span className="font-bold text-ink">{wins}<span className="font-normal text-mute">W</span> · {losses}<span className="font-normal text-mute">L</span>{draws ? <> · {draws}<span className="font-normal text-mute">D</span></> : null}</span>
          </div>
        ) : null}
      </div>

      {canManage ? (
        <div className="mt-6">
          <ChallengePanel homeTeamId={teamId} opponents={opponents} />
        </div>
      ) : (
        <p className="mt-4 text-sm text-mute">Your team&rsquo;s managers schedule matches against other Pro teams. Results show up here.</p>
      )}

      {/* Incoming challenges */}
      {incoming.length > 0 ? (
        <section className="mt-8">
          <h2 className="kicker mb-3 flex items-center gap-1.5 text-faint"><Inbox size={13} /> Challenges for you</h2>
          <div className="grid gap-3">
            {incoming.map((m) => <MatchCard key={m.id} m={m} actionable />)}
          </div>
        </section>
      ) : null}

      {/* Upcoming */}
      <section className="mt-8">
        <h2 className="kicker mb-3 flex items-center gap-1.5 text-faint"><CalendarClock size={13} /> Upcoming</h2>
        {upcoming.length === 0 ? (
          <div className="flex items-center gap-3 rounded-2xl border border-dashed border-rule bg-surface px-5 py-4 text-sm text-mute">
            <Swords size={18} className="shrink-0 text-faint" />
            <span>No matches scheduled. {canManage ? "Challenge another Pro team above to get one on the board." : "Your captains will schedule team matches here."}</span>
          </div>
        ) : (
          <div className="grid gap-3">
            {upcoming.map((m) => <MatchCard key={m.id} m={m} actionable />)}
          </div>
        )}
      </section>

      {/* Awaiting response (sent) */}
      {outgoing.length > 0 ? (
        <section className="mt-8">
          <h2 className="kicker mb-3 flex items-center gap-1.5 text-faint"><Clock size={13} /> Awaiting response</h2>
          <div className="grid gap-3">
            {outgoing.map((m) => <MatchCard key={m.id} m={m} actionable />)}
          </div>
        </section>
      ) : null}

      {/* Results */}
      {results.length > 0 ? (
        <section className="mt-8">
          <h2 className="kicker mb-3 flex items-center gap-1.5 text-faint"><Trophy size={13} /> Results</h2>
          <div className="grid gap-3">
            {results.map((m) => <MatchCard key={m.id} m={m} actionable={false} />)}
          </div>
        </section>
      ) : null}
    </div>
  );
}
