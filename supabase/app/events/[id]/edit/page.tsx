import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
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
    .select("id, title, sport_key, kind, description, location_text, location_url, starts_at, ends_at, capacity, cost_text, created_by, cover_path, thumb_path, whatsapp_url, join_policy, recurrence, recurrence_days, queue_enabled")
    .eq("id", id)
    .maybeSingle();
  if (!e) notFound();
  if (e.created_by !== user.id) {
    // co-admins may also edit
    const { data: m } = await supabase.from("event_managers").select("user_id").eq("event_id", id).eq("user_id", user.id).maybeSingle();
    if (!m) redirect(`/events/${id}`);
  }

  const bucket = supabase.storage.from("tournament-gallery");
  const coverUrl = e.cover_path ? bucket.getPublicUrl(e.cover_path).data.publicUrl : null;
  const thumbUrl = e.thumb_path ? bucket.getPublicUrl(e.thumb_path).data.publicUrl : null;

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <Breadcrumbs items={[{ label: "Events", href: "/events" }, { label: e.title, href: `/events/${e.id}` }, { label: "Edit" }]} />
      <div className="mb-6">
        <p className="kicker text-brand-deep">Edit</p>
        <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Edit event</h1>
        <p className="mt-2 text-sm text-mute">Update the details. Photo changes save right away.</p>
      </div>
      <EventForm
        initial={{
          id: e.id,
          title: e.title,
          sport_key: e.sport_key,
          kind: e.kind,
          description: e.description,
          location_text: e.location_text,
          location_url: e.location_url,
          starts_at: e.starts_at,
          ends_at: e.ends_at,
          capacity: e.capacity,
          cost_text: e.cost_text,
          whatsapp_url: e.whatsapp_url,
          join_policy: e.join_policy,
          recurrence: e.recurrence,
          recurrence_days: e.recurrence_days,
          queue_enabled: e.queue_enabled,
          cover_url: coverUrl,
          thumb_url: thumbUrl,
        }}
      />
    </div>
  );
}
