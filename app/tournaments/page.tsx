import Link from "next/link";
import { redirect } from "next/navigation";
import { Trophy, Plus, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { SPORTS, sportMeta } from "@/lib/sports";
import { createTournament } from "./actions";

const STATUS_LABEL: Record<string, string> = {
  draft: "Draft",
  published: "Published",
  registration_open: "Registration open",
  registration_closed: "Registration closed",
  in_progress: "In progress",
  completed: "Completed",
  archived: "Archived",
  cancelled: "Cancelled",
};

export default async function TournamentsHub() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/tournaments");

  const { data: prof } = await supabase.from("profiles").select("verification_status").eq("id", user.id).maybeSingle();
  const verified = prof?.verification_status === "verified";

  const { data: mine } = await supabase
    .from("tournaments")
    .select("id, code, title, sport_key, status")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false });
  const tournaments = mine ?? [];

  return (
    <div className="mx-auto max-w-5xl px-5 py-8 sm:py-10">
      <div className="mb-6 flex items-center gap-3">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-tint-brand text-brand-deep">
          <Trophy size={20} />
        </span>
        <div>
          <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Tournaments</h1>
          <p className="mt-1 text-sm text-mute">Host and run your own events on Klimr.</p>
        </div>
      </div>

      {/* create */}
      {verified ? (
        <section className="mb-8 rounded-3xl border border-rule bg-surface p-5 sm:p-6">
          <h2 className="mb-1 text-sm font-bold text-ink">Host a tournament</h2>
          <p className="mb-4 text-xs text-mute">Start a draft now — you can fill in the rest before you publish.</p>
          <form action={createTournament} className="grid gap-3 sm:grid-cols-[1fr_auto_auto_auto]">
            <input
              name="title"
              required
              maxLength={120}
              placeholder="Tournament name"
              className="rounded-xl border border-rule bg-bg px-3.5 py-2.5 text-sm text-ink outline-none placeholder:text-faint focus:border-brand"
            />
            <select name="sport_key" defaultValue="beach_volleyball" className="rounded-xl border border-rule bg-bg px-3.5 py-2.5 text-sm text-ink outline-none focus:border-brand">
              {SPORTS.map((s) => (
                <option key={s.key} value={s.key}>
                  {s.name}
                </option>
              ))}
            </select>
            <select name="entry_type" defaultValue="team" className="rounded-xl border border-rule bg-bg px-3.5 py-2.5 text-sm text-ink outline-none focus:border-brand">
              <option value="team">Team</option>
              <option value="individual">Individual</option>
            </select>
            <button type="submit" className="press inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep">
              <Plus size={16} /> Create
            </button>
          </form>
        </section>
      ) : (
        <section className="mb-8 flex items-start gap-3 rounded-3xl border border-rule bg-surface p-5">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-tint-brand text-brand-deep">
            <ShieldCheck size={18} />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-ink">Get verified to host</h2>
            <p className="mt-0.5 text-xs text-mute">Hosting tournaments is available to verified players. Verify your identity to unlock it.</p>
            <Link href="/settings/verification" className="mt-2 inline-block text-xs font-semibold text-brand-deep hover:underline">
              Verify my account →
            </Link>
          </div>
        </section>
      )}

      {/* organizing */}
      <h2 className="kicker mb-3 text-faint">Organizing</h2>
      {tournaments.length === 0 ? (
        <div className="rounded-3xl border border-dashed border-rule bg-surface/50 p-10 text-center">
          <p className="text-sm font-semibold text-ink">No tournaments yet</p>
          <p className="mt-1 text-xs text-mute">{verified ? "Create your first one above." : "Verify your account to start hosting."}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {tournaments.map((t) => {
            const meta = sportMeta(t.sport_key);
            return (
              <Link key={t.id} href={`/tournament/${t.id}`} className="lift rounded-2xl border border-rule bg-surface p-4">
                <div className="flex items-center gap-2.5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#f4f4f5] text-lg">{meta.emoji}</span>
                  <span className="rounded-full bg-bg px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-mute">{STATUS_LABEL[t.status] ?? t.status}</span>
                </div>
                <p className="mt-3 truncate text-sm font-bold text-ink">{t.title}</p>
                <p className="mt-0.5 truncate text-xs text-mute">
                  {meta.name} · /e/{t.code}
                </p>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
