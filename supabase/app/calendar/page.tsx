import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getCalendarEvents } from "@/lib/calendar";
import { CalendarView } from "@/components/calendar-view";

export const metadata: Metadata = { title: "Calendar" };

export default async function CalendarPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/login?next=/calendar");

  const events = await getCalendarEvents(supabase, user.id);

  return (
    <div className="mx-auto max-w-page px-4 py-6 sm:px-6 sm:py-8">
      <CalendarView events={events} nowIso={new Date().toISOString()} />
    </div>
  );
}
