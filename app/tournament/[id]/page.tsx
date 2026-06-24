import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { CalendarClock, MapPin, Link2, Globe, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { STATUS_LABEL, isRegistrationOpen, isSignupFormReady, type TournamentFormatConfig } from "@/lib/tournament";
import { openRegistration, closeRegistration } from "@/app/tournaments/actions";

export default async function TournamentDashboard({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/tournament/${id}`);

  const { data: t } = await supabase
    .from("tournaments")
    .select("id, code, title, sport_key, status, entry_type, starts_at, location_name, registration_opens_at, registration_deadline, format_config")
    .eq("id", id)
    .maybeSingle();
  if (!t) notFound();

  const base = `/tournament/${id}`;
  const meta = sportMeta(t.sport_key);
  const fc = (t.format_config ?? {}) as TournamentFormatConfig;
  const dateText = t.starts_at
    ? new Date(t.starts_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })
    : "Dates TBD";
  const publicUrl = `klimr.com/e/${t.code}`;

  const regOpen = isRegistrationOpen(t);
  // eslint-disable-next-line react-hooks/purity -- server component; comparing against the current time is intentional
  const regNow = Date.now();
  const regOpensAtMs = t.registration_opens_at ? new Date(t.registration_opens_at).getTime() : null;
  const beforeRegOpen = !regOpen && t.status === "published" && regOpensAtMs !== null && regNow < regOpensAtMs;
  const regOpensText = t.registration_opens_at ? new Date(t.registration_opens_at).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" }) : null;

  const { count: cfCount } = await supabase.from("tournament_custom_fields").select("id", { count: "exact", head: true }).eq("tournament_id", id);
  const signupFormReady = isSignupFormReady(fc, cfCount ?? 0);

  const setup: { label: string; note: string; done: boolean; anchor: string; href?: string }[] = [
    { label: "Basics", note: "Name, sport & entry type", done: true, anchor: "details" },
    { label: "When & where", note: "Date, time & location", done: !!t.starts_at, anchor: "location" },
    { label: "Format", note: "Pools, bracket & eligibility", done: !!fc.format_type, anchor: "format" },
    { label: "Registration", note: "Sign-up window", done: !!(t.registration_opens_at || t.registration_deadline), anchor: "registration" },
    { label: "Sign-up form", note: "Questions asked at registration", done: signupFormReady, anchor: "form", href: `${base}/form` },
    { label: "Legal", note: "Waiver & rules", done: !!(fc.legal?.waiver_text || fc.legal?.rules_text), anchor: "legal" },
    { label: "Publish", note: "Go live", done: t.status !== "draft", anchor: "visibility" },
  ];
  const completed = setup.filter((s) => s.done).length;

  return (
    <div className="mx-auto max-w-page px-5 py-8 sm:py-10">
      {/* hero */}
      <div className="relative overflow-hidden rounded-3xl border border-rail-border bg-[linear-gradient(135deg,#0e2c3a,#0a212c)] p-5 sm:p-7">
        <span aria-hidden className="pointer-events-none absolute -right-4 -top-8 select-none text-[150px] leading-none opacity-[0.07]">{meta.emoji}</span>
        <span aria-hidden className="pointer-events-none absolute -left-10 bottom-0 h-44 w-44 rounded-full bg-brand/20 blur-3xl" />
        <div className="relative">
          <div className="flex items-center gap-2">
            <span className="kicker text-rail-active">Organizer</span>
            <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-rail-fg">{STATUS_LABEL[t.status] ?? t.status}</span>
          </div>
          <h1 className="mt-1 font-display text-3xl leading-tight text-white sm:text-4xl">{t.title}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-sm text-rail-fg/80">
            <span>{meta.name}</span>
            <span className="capitalize">{t.entry_type} entry</span>
            <span className="flex items-center gap-1">
              <CalendarClock size={13} /> {dateText}
            </span>
            {t.location_name ? (
              <span className="flex items-center gap-1">
                <MapPin size={13} /> {t.location_name}
              </span>
            ) : null}
          </p>
          <Link href={`${base}/settings`} className="press relative mt-4 inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep">
            {t.status === "draft" ? "Set up your event" : "Edit details"} <ArrowRight size={15} />
          </Link>
        </div>
      </div>

      {/* share link */}
      <div className="mt-4 flex flex-wrap items-center gap-3 rounded-2xl border border-rule bg-surface p-4">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-tint-brand text-brand-deep">
          <Link2 size={17} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs text-mute">Public page</p>
          <p className="truncate font-mono text-sm text-ink">{publicUrl}</p>
        </div>
        <Link href={`/e/${t.code}`} target="_blank" rel="noopener noreferrer" className="press inline-flex items-center gap-1.5 rounded-xl border border-rule bg-bg px-3 py-2 text-xs font-semibold text-ink hover:border-brand">
          <Globe size={14} /> View
        </Link>
      </div>

      {/* registration control */}
      {regOpen ? (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-success/40 bg-tint-success p-4">
          <div>
            <p className="text-sm font-bold text-ink">Registration is open</p>
            <p className="text-xs text-mute">{t.status === "registration_open" ? "Players can sign up at your public page now." : "Opened automatically by your registration window — players can sign up now."}</p>
          </div>
          <form action={closeRegistration.bind(null, t.id)}>
            <button type="submit" className="press inline-flex items-center gap-1.5 rounded-xl border border-rule bg-surface px-4 py-2.5 text-sm font-semibold text-ink hover:border-faint">Close registration</button>
          </form>
        </div>
      ) : t.status === "published" || t.status === "registration_closed" ? (
        <form action={openRegistration.bind(null, t.id)} className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-rule bg-surface p-4">
          <div>
            <p className="text-sm font-bold text-ink">{beforeRegOpen ? "Sign-ups haven't opened yet" : "Sign-ups are closed"}</p>
            <p className="text-xs text-mute">{beforeRegOpen && regOpensText ? `Scheduled to open ${regOpensText} — open now to start early.` : "Open registration to let players enter at your public page."}</p>
          </div>
          <button type="submit" className="press inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white hover:bg-ink-soft">{beforeRegOpen ? "Open now" : "Open registration"}</button>
        </form>
      ) : null}

      {/* setup roadmap */}
      <div className="mt-6 rounded-3xl border border-rule bg-surface p-5 sm:p-6">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-ink">Set up your event</h2>
            <p className="text-xs text-mute">
              {completed} of {setup.length} steps done
            </p>
          </div>
          <Link href={`${base}/settings`} className="text-xs font-semibold text-brand-deep hover:underline">
            Edit →
          </Link>
        </div>
        <ol className="grid gap-2.5">
          {setup.map((s, i) => (
            <li key={s.label}>
              <Link href={s.href ?? `${base}/settings#${s.anchor}`} className="lift flex items-center gap-3 rounded-2xl border border-rule bg-bg/40 p-3">
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-bold ${s.done ? "bg-success text-white" : "bg-[#f4f4f5] text-mute"}`}>{s.done ? "✓" : i + 1}</span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold text-ink">{s.label}</span>
                  <span className="block truncate text-xs text-mute">{s.note}</span>
                </span>
                <ArrowRight size={15} className="shrink-0 text-faint" />
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
