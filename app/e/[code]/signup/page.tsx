import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, ArrowRight } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { IndividualSignupForm } from "@/components/tournament-signup-individual";
import { TeamSignupForm } from "@/components/tournament-signup-team";
import { isRegistrationOpen, type TournamentFormatConfig, type CustomFieldRow, type DivisionRow } from "@/lib/tournament";
import { capacityState } from "@/lib/waitlist";

function Notice({ title, sub, code, href, linkLabel }: { title: string; sub: string; code: string; href?: string; linkLabel?: string }) {
  const to = href ?? `/e/${code}`;
  return (
    <div className="rounded-3xl border border-rule bg-surface p-8 text-center">
      <p className="text-base font-bold text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-mute">{sub}</p>
      <Link href={to} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-deep hover:underline">
        {href ? null : <ArrowLeft size={15} />}
        {linkLabel ?? "Back to event"}
        {href ? <ArrowRight size={15} /> : null}
      </Link>
    </div>
  );
}

export default async function SignupPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/e/${code}/signup`);

  const { data: t } = await supabase
    .from("tournaments")
    .select("id, code, title, sport_key, entry_type, status, registration_opens_at, registration_deadline, reserves_allowed, min_women, min_men, format_config")
    .eq("code", code)
    .maybeSingle();
  if (!t) notFound();
  const meta = sportMeta(t.sport_key);

  // eslint-disable-next-line react-hooks/purity -- server component; comparing against the current time is intentional
  const deadlinePassed = !!t.registration_deadline && new Date(t.registration_deadline).getTime() < Date.now();
  const open = isRegistrationOpen(t);

  const { data: existing } = await supabase
    .from("tournament_registrations")
    .select("id")
    .eq("tournament_id", t.id)
    .eq("registrant_id", user.id)
    .not("status", "in", "(withdrawn,declined)")
    .maybeSingle();

  // When the event is full, completing the form still works — it lands the entry
  // on the waitlist (priority) instead of being refused.
  let full = false;
  if (open && !existing) {
    const { cap, open: openSpots } = await capacityState(supabase, t.id);
    full = cap != null && openSpots != null && openSpots <= 0;
  }

  let body: React.ReactNode;
  if (existing) {
    body = <Notice title="You're already registered" sub="Manage your entry from the event page." code={t.code} />;
  } else if (!open) {
    body = <Notice title={deadlinePassed ? "Registration has closed" : "Registration isn't open yet"} sub="Check back on the event page — you can follow it to hear when sign-ups open." code={t.code} />;
  } else if (t.entry_type === "team") {
    const { data: tDivs } = await supabase
      .from("tournament_divisions")
      .select("id, name, description, fee_cents, fee_basis, capacity, sort_order")
      .eq("tournament_id", t.id)
      .order("sort_order");
    const { data: tFieldRows } = await supabase
      .from("tournament_custom_fields")
      .select("id, label, description, field_type, options, required, scope, sort_order")
      .eq("tournament_id", t.id)
      .order("sort_order");
    const teamFields: CustomFieldRow[] = (tFieldRows ?? [])
      .filter((f) => f.scope === "per_team")
      .map((f) => ({
        id: f.id,
        label: f.label,
        description: f.description,
        field_type: f.field_type,
        options: Array.isArray(f.options) ? (f.options as string[]) : [],
        required: f.required,
        scope: f.scope,
        sort_order: f.sort_order,
      }));

    const fc = (t.format_config ?? {}) as TournamentFormatConfig;
    const rosterSize = fc.roster_size ?? 2;
    const reserveCap = Math.min(t.reserves_allowed ?? 0, t.sport_key === "beach_volleyball" ? 2 : 4);
    const needW = t.min_women ?? 0;
    const needM = t.min_men ?? 0;

    const { data: myTeamRows } = await supabase.from("team_members").select("team_id, role").eq("user_id", user.id).in("role", ["owner", "manager"]);
    const ownedIds = [...new Set((myTeamRows ?? []).map((r) => r.team_id))];
    let teams: { id: string; name: string; eligible: boolean; reason: string }[] = [];
    if (ownedIds.length) {
      const { data: teamRows } = await supabase.from("teams").select("id, name, sport_key").in("id", ownedIds).eq("sport_key", t.sport_key);
      const matchIds = (teamRows ?? []).map((r) => r.id);
      if (matchIds.length) {
        const { data: allMembers } = await supabase.from("team_members").select("team_id, user_id, designation").in("team_id", matchIds);
        const genderById = new Map<string, string | null>();
        if (needW > 0 || needM > 0) {
          const uids = [...new Set((allMembers ?? []).map((m) => m.user_id))];
          if (uids.length) {
            const { data: profs } = await supabase.from("profiles").select("id, gender").in("id", uids);
            for (const p of profs ?? []) genderById.set(p.id, p.gender);
          }
        }
        teams = (teamRows ?? []).map((team) => {
          const ms = (allMembers ?? []).filter((m) => m.team_id === team.id);
          const main = ms.filter((m) => m.designation !== "sub");
          const reserves = ms.filter((m) => m.designation === "sub");
          let eligible = true;
          let reason = "";
          if (main.length !== rosterSize) {
            eligible = false;
            reason = `Needs ${rosterSize} main player${rosterSize === 1 ? "" : "s"} (has ${main.length})`;
          } else if (reserves.length > reserveCap) {
            eligible = false;
            reason = `Too many reserves (max ${reserveCap})`;
          } else if (needW > 0 || needM > 0) {
            const women = main.filter((m) => genderById.get(m.user_id) === "woman").length;
            const men = main.filter((m) => genderById.get(m.user_id) === "man").length;
            if (women < needW || men < needM) {
              eligible = false;
              reason = "Doesn't meet gender minimums";
            }
          }
          return { id: team.id, name: team.name, eligible, reason };
        });
      }
    }

    if (teams.length === 0) {
      body = <Notice title="You'll need a team first" sub={`Create a ${meta.name} squad with ${rosterSize} main player${rosterSize === 1 ? "" : "s"}, then come back to enter.`} code={t.code} href="/teams" linkLabel="Go to teams" />;
    } else {
      body = <TeamSignupForm tournamentId={t.id} code={t.code} rosterSize={rosterSize} divisions={(tDivs as DivisionRow[]) ?? []} teamFields={teamFields} teams={teams} />;
    }
  } else {
    const { data: divs } = await supabase
      .from("tournament_divisions")
      .select("id, name, description, fee_cents, fee_basis, capacity, sort_order")
      .eq("tournament_id", t.id)
      .order("sort_order");
    const { data: fieldRows } = await supabase
      .from("tournament_custom_fields")
      .select("id, label, description, field_type, options, required, scope, sort_order")
      .eq("tournament_id", t.id)
      .order("sort_order");
    const fields: CustomFieldRow[] = (fieldRows ?? []).map((f) => ({
      id: f.id,
      label: f.label,
      description: f.description,
      field_type: f.field_type,
      options: Array.isArray(f.options) ? (f.options as string[]) : [],
      required: f.required,
      scope: f.scope,
      sort_order: f.sort_order,
    }));
    const fc = (t.format_config ?? {}) as TournamentFormatConfig;
    const legal = fc.legal ?? {};
    body = (
      <IndividualSignupForm
        tournamentId={t.id}
        code={t.code}
        divisions={(divs as DivisionRow[]) ?? []}
        fields={fields}
        waiverText={legal.waiver_text ?? ""}
        rulesText={legal.rules_text ?? ""}
        requireWaiver={!!legal.require_waiver}
        requireRules={!!legal.require_rules}
      />
    );
  }

  return (
    <div className="mx-auto max-w-page-narrow px-5 py-8 sm:py-10">
      <div className="mb-6">
        <p className="kicker text-brand-deep">{meta.name} · Sign up</p>
        <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">{t.title}</h1>
      </div>
      {full ? (
        <div className="mb-4 rounded-2xl border border-brand/30 bg-tint-brand px-4 py-3 text-sm text-brand-deep">
          <span className="font-bold">This event is full.</span> Completing this form adds you to the waitlist with priority — you&rsquo;ll only be asked to pay if a spot opens and the organizer accepts your entry.
        </div>
      ) : null}
      {body}
    </div>
  );
}
