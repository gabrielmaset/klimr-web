import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SPORT_KEYS } from "@/lib/sports";
import { NewSessionForm } from "@/components/queue/new-session-form";
import { BackButton } from "@/components/back-button";

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
  const { data: ev } = await supabase.from("events").select("title, sport_key").eq("id", event).maybeSingle();
  if (ev) {
    title = ev.title;
    if (SPORT_KEYS.includes(ev.sport_key)) sport = ev.sport_key;
  }

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <BackButton fallback={`/events/${event}`} label="Event" className="press mb-5 inline-flex items-center gap-1 text-sm font-semibold text-mute hover:text-ink" size={15} />
      <h1 className="font-display text-3xl text-ink sm:text-4xl">Start a live queue</h1>
      <p className="mt-2 text-sm leading-relaxed text-mute">
        Set up your courts for the day. Players join from their phones, teams form first-come, and the line manages itself. Run the winner buttons from a tablet at the net.
      </p>
      <NewSessionForm eventId={event ?? null} defaultSport={sport} defaultTitle={title} />
    </div>
  );
}
