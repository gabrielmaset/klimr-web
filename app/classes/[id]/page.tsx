import type { Metadata } from "next";
import { Breadcrumbs } from "@/components/breadcrumbs";
import { SportIcon } from "@/components/sport-icons";
import { redirect, notFound } from "next/navigation";
import { MapPin, Users, Check, X, CalendarDays, ShieldCheck } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { sportMeta, sportSlug } from "@/lib/sports";
import { formatClassPrice, spotsLeft, takesSeat, enrollmentLabel, paymentLabel } from "@/lib/classes";
import { LocalTime } from "@/components/local-time";
import { EventLocationMap } from "@/components/event-location-map";
import {
  enrollInSession,
  confirmAttendance,
  cancelEnrollment,
  markAttendance,
  markPaid,
  cancelSession,
  publishClass,
  cancelClass,
} from "@/app/classes/actions";

export const metadata: Metadata = { title: "Class" };

type Enr = { id: string; session_id: string; user_id: string; status: string; payment_status: string; confirmed_at: string | null };

const FORMAT_LABEL: Record<string, string> = {
  group_class: "Group class",
  clinic: "Clinic",
  private_lesson: "Private lesson",
  workshop: "Workshop",
  camp: "Camp",
  open_play: "Open play",
};
const LEVEL_LABEL: Record<string, string> = {
  all: "All levels",
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
  pro: "Pro / competitive",
};
const AGE_LABEL: Record<string, string> = { all_ages: "All ages", adults: "Adults (18+)", youth: "Youth (under 18)", seniors: "Seniors (55+)" };
const GENDER_LABEL: Record<string, string> = { all: "Open to all", women: "Women only", men: "Men only" };

export default async function ClassDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/classes/${id}`);

  const { data: c } = await supabase
    .from("classes")
    .select(
      "id, provider_id, sport_key, title, summary, description, status, is_paid, price_cents, price_basis, recurrence, capacity, class_format, level_label, age_group, gender_pref, what_to_bring, prerequisites, cancellation_policy, location_name, location_address, location_zip, location_lat, location_lng, location_place_id",
    )
    .eq("id", id)
    .maybeSingle();
  if (!c) notFound();

  const isOwner = c.provider_id === user.id;
  if (c.status !== "published" && !isOwner) notFound();

  const admin = createAdminClient();

  // Provider profile + headline.
  const [{ data: prof }, { data: prov }] = await Promise.all([
    admin.from("profiles").select("display_name").eq("id", c.provider_id).maybeSingle(),
    admin.from("class_providers").select("headline").eq("user_id", c.provider_id).maybeSingle(),
  ]);

  // Sessions (hide cancelled) + all enrollments for the class (one query each).
  const nowISO = new Date().toISOString();
  const { data: sessRows } = await supabase
    .from("class_sessions")
    .select("id, starts_at, ends_at, capacity, status")
    .eq("class_id", id)
    .eq("status", "scheduled")
    .order("starts_at", { ascending: true });
  const sessions = sessRows ?? [];

  const { data: enrRows } = await supabase
    .from("class_enrollments")
    .select("id, session_id, user_id, status, payment_status, confirmed_at")
    .eq("class_id", id);
  const enrollments = (enrRows as Enr[] | null) ?? [];

  // Enrollee names (owner roster only).
  const nameMap = new Map<string, string>();
  if (isOwner && enrollments.length) {
    const uids = [...new Set(enrollments.map((e) => e.user_id))];
    const { data: profs } = await admin.from("profiles").select("id, display_name").in("id", uids);
    (profs ?? []).forEach((p) => nameMap.set(p.id, p.display_name));
  }

  const bySession = (sid: string) => enrollments.filter((e) => e.session_id === sid);
  const m = sportMeta(c.sport_key);
  const priceLabel = formatClassPrice(c.is_paid, c.price_cents, c.price_basis);

  return (
    <div className="mx-auto max-w-page-narrow px-5 py-8 sm:py-10">
      <Breadcrumbs items={[{ label: "Classes & Coaching", href: "/classes" }, { label: c.title }]} />

      {/* Header */}
      <div className="rounded-3xl border border-rule bg-surface shadow-e1 p-6">
        <div className="flex items-start gap-4">
          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl" style={{ background: `color-mix(in oklab, var(--color-sport-${sportSlug(c.sport_key)}) 16%, transparent)` }}><SportIcon sport={c.sport_key} variant="glyph" size={36} /></span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <span className="kicker text-brand-deep">{m.name}</span>
              {c.recurrence === "recurring" ? <span className="kicker text-faint">· Weekly series</span> : null}
              {c.status === "draft" ? <span className="rounded-full bg-rule/60 px-2 py-0.5 text-[10px] font-bold text-mute">DRAFT</span> : null}
              {c.status === "cancelled" ? <span className="rounded-full bg-brand/10 px-2 py-0.5 text-[10px] font-bold text-brand-deep">CANCELLED</span> : null}
            </div>
            <h1 className="font-display text-3xl leading-tight text-ink">{c.title}</h1>
            {c.summary ? <p className="mt-1 text-sm text-mute">{c.summary}</p> : null}
          </div>
          <span className="shrink-0 rounded-full bg-bg px-3 py-1.5 text-sm font-bold text-ink">{priceLabel}</span>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm text-mute">
          <span className="inline-flex items-center gap-1.5">
            <ShieldCheck size={15} className="text-brand-deep" /> Hosted by {prof?.display_name ?? "a Klimr coach"}
          </span>
          {c.location_name ? (
            <span className="inline-flex items-center gap-1.5">
              <MapPin size={15} /> {c.location_name}
              {c.location_address ? <span className="text-faint">· {c.location_address}</span> : null}
            </span>
          ) : null}
        </div>
        {prov?.headline ? <p className="mt-1 text-xs text-faint">{prov.headline}</p> : null}

        <div className="mt-4 flex flex-wrap gap-2">
          <span className="rounded-full bg-bg px-2.5 py-1 text-xs font-semibold text-ink">{FORMAT_LABEL[c.class_format] ?? "Class"}</span>
          <span className="rounded-full bg-bg px-2.5 py-1 text-xs font-semibold text-ink">{LEVEL_LABEL[c.level_label] ?? "All levels"}</span>
          {c.age_group !== "all_ages" ? <span className="rounded-full bg-bg px-2.5 py-1 text-xs font-semibold text-ink">{AGE_LABEL[c.age_group]}</span> : null}
          {c.gender_pref !== "all" ? <span className="rounded-full bg-bg px-2.5 py-1 text-xs font-semibold text-ink">{GENDER_LABEL[c.gender_pref]}</span> : null}
          {c.capacity ? <span className="rounded-full bg-bg px-2.5 py-1 text-xs font-semibold text-ink">Up to {c.capacity} per session</span> : null}
        </div>

        {c.description ? <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">{c.description}</p> : null}
      </div>

      {/* Owner controls */}
      {isOwner ? (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-2xl border border-rule bg-surface shadow-e1 p-4">
          <span className="mr-1 text-xs font-semibold text-mute">Coach controls:</span>
          {c.status === "draft" ? (
            <form action={publishClass}>
              <input type="hidden" name="classId" value={c.id} />
              <button className="press rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep">Publish</button>
            </form>
          ) : null}
          {c.status !== "cancelled" ? (
            <form action={cancelClass}>
              <input type="hidden" name="classId" value={c.id} />
              <button className="press rounded-full border border-rule px-4 py-1.5 text-sm font-semibold text-mute transition-colors hover:text-brand-deep">
                Cancel class
              </button>
            </form>
          ) : null}
        </div>
      ) : null}

      {/* Location map */}
      {c.location_name || c.location_address || (c.location_lat != null && c.location_lng != null) ? (
        <section className="mt-6">
          <h2 className="mb-3 text-sm font-semibold text-mute">Location</h2>
          <div className="h-56">
            <EventLocationMap
              name={c.location_name}
              address={c.location_address}
              zip={c.location_zip}
              lat={c.location_lat}
              lng={c.location_lng}
              placeId={c.location_place_id}
            />
          </div>
        </section>
      ) : null}

      {/* Good to know */}
      {c.what_to_bring || c.prerequisites || c.cancellation_policy ? (
        <section className="mt-6 space-y-3 rounded-2xl border border-rule bg-surface shadow-e1 p-5">
          <h2 className="text-sm font-bold text-ink">Good to know</h2>
          {c.prerequisites ? (
            <div>
              <div className="text-xs font-semibold text-mute">Prerequisites</div>
              <p className="text-sm text-ink-soft">{c.prerequisites}</p>
            </div>
          ) : null}
          {c.what_to_bring ? (
            <div>
              <div className="text-xs font-semibold text-mute">What to bring</div>
              <p className="text-sm text-ink-soft">{c.what_to_bring}</p>
            </div>
          ) : null}
          {c.cancellation_policy ? (
            <div>
              <div className="text-xs font-semibold text-mute">Cancellation policy</div>
              <p className="text-sm text-ink-soft">{c.cancellation_policy}</p>
            </div>
          ) : null}
        </section>
      ) : null}

      {/* Sessions */}
      <section className="mt-8">
        <h2 className="mb-3 text-sm font-semibold text-mute">{c.recurrence === "recurring" ? "Sessions" : "Session"}</h2>
        {sessions.length === 0 ? (
          <div className="rounded-2xl border border-rule bg-surface shadow-e1 p-8 text-center text-sm text-mute">No upcoming sessions.</div>
        ) : (
          <div className="space-y-3">
            {sessions.map((s) => {
              const seats = bySession(s.id);
              const taken = seats.filter((e) => takesSeat(e.status)).length;
              const left = spotsLeft(s.capacity, c.capacity, taken);
              const mine = seats.find((e) => e.user_id === user.id);
              const isPast = s.starts_at < nowISO;
              return (
                <div key={s.id} className="rounded-2xl border border-rule bg-surface shadow-e1 p-4">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <CalendarDays size={16} className="text-brand-deep" />
                      <div>
                        <div className="text-sm font-bold text-ink">
                          <LocalTime iso={s.starts_at} />
                          {isPast ? <span className="ml-2 text-[11px] font-semibold text-faint">(past)</span> : null}
                        </div>
                        <div className="text-xs text-mute">
                          {left == null ? "Open capacity" : `${left} of ${s.capacity ?? c.capacity} spot${(s.capacity ?? c.capacity) === 1 ? "" : "s"} left`}
                          <span className="text-faint"> · {taken} enrolled</span>
                        </div>
                      </div>
                    </div>

                    {/* Player controls */}
                    {!isOwner && c.status === "published" ? (
                      <div className="flex items-center gap-2">
                        {c.is_paid && mine && mine.payment_status === "pending" && takesSeat(mine.status) ? (
                          <span className="rounded-full bg-brand/10 px-2.5 py-1 text-xs font-semibold text-brand-deep">{paymentLabel("pending")}</span>
                        ) : null}
                        {!mine || mine.status === "cancelled" ? (
                          !isPast ? (
                            <form action={enrollInSession}>
                              <input type="hidden" name="sessionId" value={s.id} />
                              <button className="press rounded-full bg-brand px-4 py-1.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep">
                                {left === 0 ? "Join waitlist" : "Sign up"}
                              </button>
                            </form>
                          ) : (
                            <span className="text-xs text-faint">Closed</span>
                          )
                        ) : mine.status === "waitlisted" ? (
                          <>
                            <span className="rounded-full bg-rule/60 px-2.5 py-1 text-xs font-semibold text-mute">Waitlisted</span>
                            <CancelBtn enrollmentId={mine.id} classId={c.id} />
                          </>
                        ) : mine.status === "enrolled" ? (
                          <>
                            {mine.confirmed_at ? (
                              <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">
                                <Check size={13} /> Confirmed
                              </span>
                            ) : !isPast ? (
                              <form action={confirmAttendance}>
                                <input type="hidden" name="enrollmentId" value={mine.id} />
                                <input type="hidden" name="classId" value={c.id} />
                                <button className="press rounded-full border border-success/40 bg-success/5 px-3 py-1.5 text-xs font-semibold text-success transition-colors hover:bg-success/10">
                                  Confirm attendance
                                </button>
                              </form>
                            ) : (
                              <span className="rounded-full bg-success/10 px-2.5 py-1 text-xs font-semibold text-success">Enrolled</span>
                            )}
                            {!isPast ? <CancelBtn enrollmentId={mine.id} classId={c.id} /> : null}
                          </>
                        ) : (
                          <span className="rounded-full bg-bg px-2.5 py-1 text-xs font-semibold text-mute">{enrollmentLabel(mine.status)}</span>
                        )}
                      </div>
                    ) : null}

                    {/* Owner: cancel this session */}
                    {isOwner && c.status !== "cancelled" ? (
                      <form action={cancelSession}>
                        <input type="hidden" name="sessionId" value={s.id} />
                        <input type="hidden" name="classId" value={c.id} />
                        <button className="press rounded-full border border-rule px-3 py-1.5 text-xs font-semibold text-mute transition-colors hover:text-brand-deep">
                          Cancel session
                        </button>
                      </form>
                    ) : null}
                  </div>

                  {/* Owner roster */}
                  {isOwner ? (
                    <div className="mt-3 border-t border-rule/60 pt-3">
                      {seats.filter((e) => e.status !== "cancelled").length === 0 ? (
                        <p className="flex items-center gap-1.5 text-xs text-faint">
                          <Users size={13} /> No sign-ups yet.
                        </p>
                      ) : (
                        <ul className="space-y-1.5">
                          {seats
                            .filter((e) => e.status !== "cancelled")
                            .map((e) => (
                              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-bg/50 px-3 py-2">
                                <div className="flex items-center gap-2">
                                  <span className="text-sm font-medium text-ink">{nameMap.get(e.user_id) ?? "Player"}</span>
                                  <span className="rounded-full bg-surface px-2 py-0.5 text-[10px] font-semibold text-mute">{enrollmentLabel(e.status)}</span>
                                  {c.is_paid ? (
                                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${e.payment_status === "paid" ? "bg-success/10 text-success" : "bg-brand/10 text-brand-deep"}`}>
                                      {e.payment_status === "paid" ? "Paid" : "Payment due"}
                                    </span>
                                  ) : null}
                                  {e.confirmed_at ? <Check size={13} className="text-success" aria-label="confirmed" /> : null}
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <AttBtn enrollmentId={e.id} classId={c.id} value="attended" label="Attended" active={e.status === "attended"} />
                                  <AttBtn enrollmentId={e.id} classId={c.id} value="no_show" label="No-show" active={e.status === "no_show"} />
                                  {c.is_paid ? (
                                    <form action={markPaid}>
                                      <input type="hidden" name="enrollmentId" value={e.id} />
                                      <input type="hidden" name="classId" value={c.id} />
                                      <input type="hidden" name="value" value={e.payment_status === "paid" ? "pending" : "paid"} />
                                      <button className="press rounded-full border border-rule px-2.5 py-1 text-[11px] font-semibold text-ink transition-colors hover:bg-surface">
                                        {e.payment_status === "paid" ? "Mark unpaid" : "Mark paid"}
                                      </button>
                                    </form>
                                  ) : null}
                                </div>
                              </li>
                            ))}
                        </ul>
                      )}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {!isOwner ? (
        <p className="mt-6 flex items-start gap-2 text-xs leading-relaxed text-faint">
          <ShieldCheck size={13} className="mt-0.5 shrink-0" />
          {c.is_paid
            ? "Klimr doesn't process payments yet — the coach will arrange payment with you directly."
            : "Sign up to reserve your spot. You can cancel anytime to free it for someone else."}
        </p>
      ) : null}
    </div>
  );
}

function CancelBtn({ enrollmentId, classId }: { enrollmentId: string; classId: string }) {
  return (
    <form action={cancelEnrollment}>
      <input type="hidden" name="enrollmentId" value={enrollmentId} />
      <input type="hidden" name="classId" value={classId} />
      <button className="press inline-flex items-center gap-1 rounded-full border border-rule px-3 py-1.5 text-xs font-semibold text-mute transition-colors hover:text-brand-deep">
        <X size={13} /> Cancel
      </button>
    </form>
  );
}

function AttBtn({ enrollmentId, classId, value, label, active }: { enrollmentId: string; classId: string; value: string; label: string; active: boolean }) {
  return (
    <form action={markAttendance}>
      <input type="hidden" name="enrollmentId" value={enrollmentId} />
      <input type="hidden" name="classId" value={classId} />
      <input type="hidden" name="value" value={active ? "enrolled" : value} />
      <button
        className={`press rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors ${
          active ? "bg-ink text-pop" : "border border-rule text-mute hover:text-ink"
        }`}
      >
        {label}
      </button>
    </form>
  );
}
