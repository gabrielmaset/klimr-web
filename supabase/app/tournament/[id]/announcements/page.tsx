import { redirect, notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { AnnouncementsEditor } from "@/components/announcements-editor";
import type { TournamentFormatConfig, Announcement } from "@/lib/tournament";

export default async function AnnouncementsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/tournament/${id}/announcements`);

  const { data: t } = await supabase.from("tournaments").select("id, format_config").eq("id", id).maybeSingle();
  if (!t) notFound();
  const fc = (t.format_config ?? {}) as TournamentFormatConfig;
  const announcements: Announcement[] = Array.isArray(fc.announcements) ? fc.announcements : [];

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      <div className="mb-6">
        <p className="kicker text-brand-deep">Promotion</p>
        <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">Announcements</h1>
        <p className="mt-2 max-w-2xl text-sm text-mute">Post updates that show on your public event page — keep players and followers in the loop before and during the event.</p>
      </div>
      <AnnouncementsEditor tournamentId={t.id} initial={announcements} />
    </div>
  );
}
