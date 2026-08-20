import { createAdminClient } from "@/lib/supabase/admin";
import { ConfirmWaitlistWithdraw } from "@/components/confirm-waitlist-withdraw";

export const dynamic = "force-dynamic";

export default async function WaitlistWithdrawPage({ searchParams }: { searchParams: Promise<{ id?: string }> }) {
  const { id } = await searchParams;
  let eventTitle = "this event";
  let removed = false;
  let found = false;
  if (id) {
    const admin = createAdminClient();
    const { data: w } = await admin.from("tournament_waitlist").select("id, status, tournament_id").eq("id", id).maybeSingle();
    if (w) {
      found = true;
      removed = w.status === "removed";
      const { data: t } = await admin.from("tournaments").select("title").eq("id", w.tournament_id).maybeSingle();
      eventTitle = t?.title ?? "this event";
    }
  }

  return (
    <div className="mx-auto flex min-h-[60vh] max-w-md flex-col justify-center px-5 py-10">
      <div className="rounded-3xl border border-rule bg-surface shadow-e1 p-8">
        <p className="kicker mb-3 text-center text-brand-deep">Waitlist</p>
        {!id || !found ? (
          <p className="text-center text-sm text-mute">This waitlist link is invalid or has expired. If you still want off a waitlist, open the event page and manage it there.</p>
        ) : removed ? (
          <div className="text-center">
            <p className="text-base font-bold text-ink">You&rsquo;re not on this waitlist</p>
            <p className="mt-1 text-sm text-mute">You&rsquo;ve already been removed from the waitlist for {eventTitle}.</p>
          </div>
        ) : (
          <ConfirmWaitlistWithdraw id={id} eventTitle={eventTitle} />
        )}
      </div>
    </div>
  );
}
