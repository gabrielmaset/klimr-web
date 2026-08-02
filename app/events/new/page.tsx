import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { accountActive } from "@/lib/guards";
import { EventForm } from "@/components/event-form";
import { SPORT_KEYS } from "@/lib/sports";

export const metadata: Metadata = { title: "Host an event" };

export default async function NewEventPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/events/new");
  if (!(await accountActive(supabase, user.id))) redirect("/events");

  const { data: prof } = await supabase.from("profiles").select("primary_sport").eq("id", user.id).maybeSingle();
  const defaultSport = prof?.primary_sport && SPORT_KEYS.includes(prof.primary_sport) ? prof.primary_sport : null;

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-6">
        <p className="kicker text-brand-deep">Host</p>
        <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Host an event</h1>
        <p className="mt-2 text-sm text-mute">Open play, a ladder night, a clinic, a casual round-robin, or a social — set it up and players nearby can RSVP.</p>
      </div>
      <EventForm defaultSport={defaultSport} />
    </div>
  );
}
