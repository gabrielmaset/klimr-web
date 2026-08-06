import Link from "next/link";
import { sanitizeRichText, looksLikeHtml } from "@/lib/rich-text";
import type { Metadata } from "next";
import { redirect, notFound } from "next/navigation";
import { ArrowLeft, Repeat } from "lucide-react";
import { createClient } from "@/lib/supabase/server";
import { sportMeta } from "@/lib/sports";
import { rosterLockAt } from "@/lib/tournament";
import { SubstitutionAcceptForm } from "@/components/substitution-accept-form";
import type { TournamentFormatConfig, CustomFieldRow } from "@/lib/tournament";

export const metadata: Metadata = { title: "Substitution request" };

const nowMs = () => Date.now();

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

export default async function SubstitutePage({ params }: { params: Promise<{ code: string; requestId: string }> }) {
  const { code, requestId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect(`/login?next=/e/${code}/substitute/${requestId}`);

  const { data: t } = await supabase
    .from("tournaments")
    .select("id, code, title, sport_key, status, starts_at, roster_lock_policy, roster_lock_custom, format_config")
    .eq("code", code)
    .maybeSingle();
  if (!t) notFound();
  const meta = sportMeta(t.sport_key);

  // RLS lets exactly the four parties read the request; anyone else sees 404.
  const { data: req } = await supabase
    .from("tournament_substitution_requests")
    .select("id, tournament_id, registration_id, team_id, requested_by, player_out, player_in, status, note, expires_at, created_at")
    .eq("id", requestId)
    .eq("tournament_id", t.id)
    .maybeSingle();
  if (!req) notFound();

  const lockAt = rosterLockAt(t);
  const closed = ["completed", "cancelled", "archived"].includes(t.status);
  const deadlinePassed = !!lockAt && nowMs() > lockAt.getTime();

  let body: React.ReactNode;
  if (req.player_in !== user.id) {
    const STATUS_LABEL: Record<string, string> = {
      pending: "is waiting on the invited player",
      accepted: "was accepted — the roster has changed",
      declined: "was declined — the roster is unchanged",
      cancelled: "was withdrawn",
      expired: "expired at the roster deadline",
    };
    body = <Notice title="Substitution request" sub={`This request ${STATUS_LABEL[req.status] ?? "isn't open"}.`} code={t.code} />;
  } else if (req.status === "accepted") {
    body = <Notice title="You're on the roster" sub="You accepted this substitution — see you on court." code={t.code} />;
  } else if (req.status !== "pending") {
    const SUB: Record<string, string> = {
      declined: "You declined this request. Nothing changed.",
      cancelled: "The requester withdrew this request — no action needed.",
      expired: "This request expired at the roster deadline.",
    };
    body = <Notice title="This request is closed" sub={SUB[req.status] ?? "This request is no longer open."} code={t.code} />;
  } else if (closed) {
    body = <Notice title="This event is closed" sub="Roster changes aren't being accepted anymore." code={t.code} />;
  } else if (deadlinePassed) {
    body = <Notice title="The roster deadline has passed" sub="Substitutions for this event closed before you could respond." code={t.code} />;
  } else {
    const ids = [req.requested_by, req.player_out];
    const { data: profs } = await supabase.from("profiles").select("id, display_name").in("id", ids);
    const nameOf = new Map((profs ?? []).map((p) => [p.id, p.display_name]));

    const { data: fieldRows } = await supabase
      .from("tournament_custom_fields")
      .select("id, label, description, field_type, options, required, scope, sort_order, reask_on_substitution")
      .eq("tournament_id", t.id)
      .order("sort_order");
    // Substitutes answer the per-player questions the organizer flagged for
    // re-asking (the form-maker option) — team-level answers stay with the entry.
    const fields: CustomFieldRow[] = (fieldRows ?? [])
      .filter((f) => f.scope === "per_player" && f.reask_on_substitution)
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
      <div className="grid gap-6">
        <div className="rounded-2xl border border-rule bg-surface p-4">
          <p className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Repeat size={15} className="text-brand" />
            {nameOf.get(req.requested_by) ?? "Your captain"} asked you to take {nameOf.get(req.player_out) ?? "a teammate"}&rsquo;s spot.
          </p>
          {req.note ? <p className="mt-1.5 whitespace-pre-wrap text-sm text-ink-soft">&ldquo;{req.note}&rdquo;</p> : null}
          <p className="mt-2 text-xs text-mute">
            {lockAt
              ? `Respond before ${lockAt.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })} — the deadline is checked again the moment you accept.`
              : "Accepting puts you on this entry immediately."}
          </p>
        </div>
        <SubstitutionAcceptForm
          requestId={req.id}
          code={t.code}
          fields={fields}
          waiverText={legal.waiver_text ?? ""}
          rulesText={legal.rules_text ?? ""}
        rulesHtml={legal.rules_text && looksLikeHtml(legal.rules_text) ? sanitizeRichText(legal.rules_text) : null}
          requireWaiver={!!legal.require_waiver}
          requireRules={!!legal.require_rules}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-page-narrow px-5 py-8 sm:py-10">
      <div className="mb-6">
        <p className="kicker text-faint">
          {meta.name} · {t.title}
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-ink">Substitution request</h1>
      </div>
      {body}
    </div>
  );
}
