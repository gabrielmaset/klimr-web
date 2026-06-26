import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BackButton } from "@/components/back-button";
import { EventForm } from "@/components/event-form";

export const metadata: Metadata = { title: "Edit event" };

export default async function EditEventPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/events/${id}/edit`);

  const { data: e } = await supabase
    .from("events")
    .select("id, title, sport_key, kind, description, location_text, starts_at, ends_at, capacity, cost_text, created_by")
    .eq("id", id)
    .maybeSingle();
  if (!e) notFound();
  if (e.created_by !== user.id) redirect(`/events/${id}`);

  return (
    <div className="mx-auto max-w-page-narrow px-5 py-8 sm:py-10">
      <BackButton fallback={`/events/${id}`} label="Event" className="press mb-5 inline-flex items-center gap-1 text-sm font-semibold text-mute hover:text-ink" size={15} />
      <div className="mb-6">
        <p className="kicker text-brand-deep">Edit</p>
        <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Edit event</h1>
        <p className="mt-2 text-sm text-mute">Update the details. To change the cover photo, use the photo on the event page.</p>
      </div>
      <EventForm
        initial={{
          id: e.id,
          title: e.title,
          sport_key: e.sport_key,
          kind: e.kind,
          description: e.description,
          location_text: e.location_text,
          starts_at: e.starts_at,
          ends_at: e.ends_at,
          capacity: e.capacity,
          cost_text: e.cost_text,
        }}
      />
    </div>
  );
}
