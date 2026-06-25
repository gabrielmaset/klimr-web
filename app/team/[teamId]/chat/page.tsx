import { redirect } from "next/navigation";
import { MessageCircle, Users, UserPlus, UserMinus, Crown, ShieldCheck, Pencil, Sparkles, Activity } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { Avatar } from "@/components/avatar";

type Prof = { id: string; display_name: string; avatar_hue: number; avatar_path: string | null };
type Event = { id: string; kind: string; actor_id: string | null; target_id: string | null; body: string | null; created_at: string };

const EVENT_ICON: Record<string, typeof UserPlus> = {
  team_created: Sparkles,
  member_joined: UserPlus,
  member_left: UserMinus,
  member_removed: UserMinus,
  owner_transferred: Crown,
  role_changed: ShieldCheck,
  team_renamed: Pencil,
};

export default async function TeamChat({ params }: { params: Promise<{ teamId: string }> }) {
  const { teamId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/team/${teamId}/chat`);

  const { data: team } = await supabase.from("teams").select("id, name, sport_key").eq("id", teamId).maybeSingle();
  if (!team) redirect("/teams");

  const { data: memberRows } = await supabase.from("team_members").select("user_id").eq("team_id", teamId).order("joined_at");
  const memberIds = (memberRows ?? []).map((m) => m.user_id);

  // The team's activity log (members joining/leaving, renames, ownership changes).
  const { data: conv } = await supabase.from("conversations").select("id").eq("team_id", teamId).maybeSingle();
  let events: Event[] = [];
  if (conv?.id) {
    const { data: ev } = await supabase
      .from("conversation_events")
      .select("id, kind, actor_id, target_id, body, created_at")
      .eq("conversation_id", conv.id)
      .order("created_at", { ascending: false })
      .limit(50);
    events = (ev as Event[] | null) ?? [];
  }

  // Resolve names for members + anyone referenced by an event (incl. people who left).
  const ids = new Set<string>(memberIds);
  for (const e of events) {
    if (e.actor_id) ids.add(e.actor_id);
    if (e.target_id) ids.add(e.target_id);
  }
  const profById = new Map<string, Prof>();
  if (ids.size) {
    const { data: profs } = await supabase.from("profiles").select("id, display_name, avatar_hue, avatar_path").in("id", [...ids]);
    for (const p of (profs as Prof[] | null) ?? []) profById.set(p.id, p);
  }
  const avatarUrl = (p: Prof | undefined) => (p?.avatar_path ? supabase.storage.from("avatars").getPublicUrl(p.avatar_path).data.publicUrl : null);
  const nameOf = (id: string | null) => (id ? profById.get(id)?.display_name ?? "Someone" : "Someone");

  function describe(e: Event): string {
    switch (e.kind) {
      case "team_created":
        return `${nameOf(e.actor_id)} created the team`;
      case "member_joined":
        return `${nameOf(e.target_id ?? e.actor_id)} joined the team`;
      case "member_left":
        return `${nameOf(e.actor_id)} left the team`;
      case "member_removed":
        return `${nameOf(e.target_id)} was removed from the team`;
      case "owner_transferred":
        return `${nameOf(e.target_id)} became the team owner`;
      case "role_changed":
        return `${nameOf(e.target_id)} is now ${e.body ?? "a member"}`;
      case "team_renamed":
        return `Team renamed to ${e.body ?? "a new name"}`;
      default:
        return "The team was updated";
    }
  }

  const fmtTime = (iso: string) => new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <p className="kicker mb-1 text-brand-deep">Team chat</p>
      <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">{team.name}</h1>

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_18rem]">
        {/* activity timeline */}
        <section className="rounded-3xl border border-rule bg-surface p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <p className="flex items-center gap-2 text-sm font-bold text-ink">
              <Activity size={16} className="text-mute" /> Team activity
            </p>
            <span className="text-xs text-faint">{events.length} {events.length === 1 ? "update" : "updates"}</span>
          </div>

          <div className="mt-4 flex items-center gap-2 rounded-xl border border-dashed border-brand/30 bg-tint-brand/40 px-3.5 py-2.5 text-xs font-medium text-brand-deep">
            <MessageCircle size={14} className="shrink-0" />
            Live group messaging is coming next. For now, every roster change is logged here so the whole team stays in the loop.
          </div>

          {events.length ? (
            <ol className="mt-4 space-y-1">
              {events.map((e) => {
                const Icon = EVENT_ICON[e.kind] ?? Activity;
                return (
                  <li key={e.id} className="flex items-start gap-3 rounded-xl px-2 py-2 hover:bg-bg/60">
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-bg text-mute ring-1 ring-inset ring-rule">
                      <Icon size={14} />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm text-ink">{describe(e)}</p>
                      <p className="text-[11px] text-faint">{fmtTime(e.created_at)}</p>
                    </div>
                  </li>
                );
              })}
            </ol>
          ) : (
            <p className="mt-6 text-center text-sm text-mute">No activity yet.</p>
          )}
        </section>

        {/* roster */}
        <section className="h-fit rounded-3xl border border-rule bg-surface p-5">
          <p className="flex items-center gap-2 text-sm font-bold text-ink">
            <Users size={16} className="text-mute" /> Roster ({memberIds.length})
          </p>
          <div className="mt-3 grid gap-2.5">
            {memberIds.map((id) => {
              const p = profById.get(id);
              return (
                <div key={id} className="flex items-center gap-2.5">
                  <Avatar url={avatarUrl(p)} hue={p?.avatar_hue ?? 200} name={p?.display_name ?? "Player"} size={32} />
                  <span className="min-w-0 flex-1 truncate text-sm text-ink-soft">{p?.display_name ?? "Player"}</span>
                </div>
              );
            })}
            {memberIds.length === 0 ? <p className="text-sm text-mute">No members yet.</p> : null}
          </div>
        </section>
      </div>
    </div>
  );
}
