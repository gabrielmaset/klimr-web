import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { ConfirmForm } from "@/components/tournament-confirm-form";
import type { TournamentFormatConfig, CustomFieldRow } from "@/lib/tournament";

function Notice({ title, sub, code }: { title: string; sub: string; code: string }) {
  return (
    <div className="rounded-3xl border border-rule bg-surface p-8 text-center">
      <p className="text-base font-bold text-ink">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-sm text-mute">{sub}</p>
      <Link href={`/e/${code}`} className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-brand-deep hover:underline">
        <ArrowLeft size={15} /> Back to event
      </Link>
    </div>
  );
}

export default async function ConfirmPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/e/${code}/confirm`);

  const { data: t } = await supabase
    .from("tournaments")
    .select("id, code, title, sport_key, status, format_config")
    .eq("code", code)
    .maybeSingle();
  if (!t) notFound();
  const meta = sportMeta(t.sport_key);

  const closed = t.status === "completed" || t.status === "cancelled" || t.status === "archived";

  const { data: prs } = await supabase
    .from("tournament_registration_players")
    .select("registration_id, confirmed_at")
    .eq("tournament_id", t.id)
    .eq("user_id", user.id);

  let activeConfirmed: boolean | null = null;
  if (prs && prs.length) {
    const regIds = prs.map((p) => p.registration_id);
    const { data: regs } = await supabase.from("tournament_registrations").select("id").in("id", regIds).not("status", "in", "(withdrawn,declined)");
    const activeRegId = regs && regs.length ? regs[0].id : null;
    if (activeRegId) activeConfirmed = !!prs.find((p) => p.registration_id === activeRegId)?.confirmed_at;
  }

  let body: React.ReactNode;
  if (closed) {
    body = <Notice title="This event is closed" sub="Confirmations aren't being accepted right now." code={t.code} />;
  } else if (activeConfirmed === null) {
    body = <Notice title="You're not on a roster here" sub="Ask your team captain to add you, or head back to the event page." code={t.code} />;
  } else if (activeConfirmed) {
    body = <Notice title="You're all set" sub="You've already confirmed your spot for this event." code={t.code} />;
  } else {
    const { data: fieldRows } = await supabase
      .from("tournament_custom_fields")
      .select("id, label, description, field_type, options, required, scope, sort_order")
      .eq("tournament_id", t.id)
      .order("sort_order");
    const fields: CustomFieldRow[] = (fieldRows ?? [])
      .filter((f) => f.scope === "per_player")
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
    const legal = fc.legal ?? {};
    body = (
      <ConfirmForm
        tournamentId={t.id}
        code={t.code}
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
        <p className="kicker text-brand-deep">{meta.name} · Confirm your spot</p>
        <h1 className="font-display text-3xl leading-none text-ink sm:text-4xl">{t.title}</h1>
        <p className="mt-2 text-sm text-mute">Confirm you&rsquo;re in — accept the waiver and rules, and answer anything the organizer needs from you.</p>
      </div>
      {body}
    </div>
  );
}
