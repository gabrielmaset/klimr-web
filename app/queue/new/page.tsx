import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SPORT_KEYS, sportMeta } from "@/lib/sports";
import { LEVELS, FORMATIONS, formationLabel } from "@/lib/queue";
import { createSession } from "@/app/queue/actions";

export const metadata: Metadata = { title: "Start a live queue" };

export default async function NewQueuePage({ searchParams }: { searchParams: Promise<{ event?: string }> }) {
  const { event } = await searchParams;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/queue/new");
  // The live queue always belongs to an event — send people to pick one if none was passed.
  if (!event) redirect("/events");

  let title = "";
  let sport = "beach_volleyball";
  if (event) {
    const { data: ev } = await supabase.from("events").select("title, sport_key").eq("id", event).maybeSingle();
    if (ev) {
      title = ev.title;
      if (SPORT_KEYS.includes(ev.sport_key)) sport = ev.sport_key;
    }
  }

  return (
    <div className="mx-auto max-w-2xl px-5 py-8 sm:py-10">
      <h1 className="font-display text-3xl text-ink sm:text-4xl">Start a live queue</h1>
      <p className="mt-2 text-sm leading-relaxed text-mute">
        Set up your courts for the day. Players join from their phones, teams form first-come, and the line manages itself. Run the winner buttons from a tablet at the net.
      </p>

      <form action={createSession} className="mt-6 space-y-6 rounded-3xl border border-rule bg-surface p-5 sm:p-6">
        {event ? <input type="hidden" name="eventId" value={event} /> : null}

        <div>
          <label className="mb-1 block text-sm font-semibold text-ink">Session name</label>
          <input name="title" defaultValue={title} placeholder="Saturday beach volley" className="w-full rounded-xl border border-rule bg-white px-3 py-2.5 text-sm outline-none focus:border-brand" />
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-ink">Sport</label>
          <select name="sport" defaultValue={sport} className="w-full rounded-xl border border-rule bg-white px-3 py-2.5 text-sm">
            {SPORT_KEYS.map((k) => {
              const m = sportMeta(k);
              return (
                <option key={k} value={k}>
                  {m.emoji} {m.name}
                </option>
              );
            })}
          </select>
        </div>

        <div>
          <label className="mb-1 block text-sm font-semibold text-ink">Win rule</label>
          <select name="winCap" defaultValue="1" className="w-full rounded-xl border border-rule bg-white px-3 py-2.5 text-sm">
            <option value="1">Play once — re-form a new team every game</option>
            <option value="2">Winners stay until 2 wins, then re-form</option>
            <option value="3">Winners stay until 3 wins, then re-form</option>
            <option value="5">Winners stay until 5 wins, then re-form</option>
          </select>
          <p className="mt-1 text-xs text-faint">King of the court: the losing team always re-forms; the winner keeps playing until it hits this many wins.</p>
        </div>

        <div className="border-t border-rule pt-5">
          <p className="text-sm font-semibold text-ink">First court</p>
          <p className="mb-3 text-xs text-faint">You can add more courts after you create the session.</p>
          <div className="flex flex-wrap items-end gap-5">
            <div>
              <label className="mb-1 block text-xs font-semibold text-mute">Formation</label>
              <select name="courtSize" defaultValue="4" className="rounded-xl border border-rule bg-white px-3 py-2 text-sm">
                {FORMATIONS.map((n) => (
                  <option key={n} value={n}>
                    {formationLabel(n)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-semibold text-mute">Levels (optional)</label>
              <div className="flex flex-wrap gap-3">
                {LEVELS.map((l) => (
                  <label key={l.key} className="inline-flex cursor-pointer items-center gap-1.5 text-sm text-ink-soft">
                    <input type="checkbox" name="levels" value={l.key} className="h-4 w-4 accent-[#ff4e1b]" />
                    {l.label}
                  </label>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="space-y-2 border-t border-rule pt-5">
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" name="allowGuests" defaultChecked className="h-4 w-4 accent-[#ff4e1b]" />
            Allow walk-up sign-ups (no Klimr account — join by name)
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" name="requireLocation" defaultChecked className="h-4 w-4 accent-[#ff4e1b]" />
            Verify players are on-site (must be within ~150m when they join)
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" name="requireApproval" className="h-4 w-4 accent-[#ff4e1b]" />
            Approve each player before they join the line
          </label>
          <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
            <input type="checkbox" name="allowFullTeams" className="h-4 w-4 accent-[#ff4e1b]" />
            Let players drop a complete team into the line at once
          </label>
          {event ? (
            <label className="flex cursor-pointer items-center gap-2 text-sm text-ink-soft">
              <input type="checkbox" name="eventOnly" className="h-4 w-4 accent-[#ff4e1b]" />
              Only players who RSVP&apos;d to this event can join <span className="text-faint">(turns off walk-ups)</span>
            </label>
          ) : null}
        </div>

        <button type="submit" className="press w-full rounded-full bg-brand py-3 text-sm font-semibold text-white hover:bg-brand-deep">
          Create session
        </button>
      </form>
    </div>
  );
}
