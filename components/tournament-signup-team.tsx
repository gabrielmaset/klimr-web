"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check, Users } from "lucide-react";
import { OptionCards } from "@/components/form-kit";
import { CustomFieldsRenderer, type AnswerMap } from "@/components/custom-fields-renderer";
import { signUpTeam } from "@/app/tournaments/actions";
import { formatFee, type CustomFieldRow, type DivisionRow } from "@/lib/tournament";
import { RegistrantSharedInfo, type SharedInfo } from "@/components/registrant-shared-info";

type TeamOpt = { id: string; name: string; eligible: boolean; reason: string };

export function TeamSignupForm({
  tournamentId,
  code,
  rosterSize,
  divisions,
  teamFields,
  teams,
  sharedInfo,
}: {
  tournamentId: string;
  code: string;
  rosterSize: number;
  divisions: DivisionRow[];
  teamFields: CustomFieldRow[];
  teams: TeamOpt[];
  sharedInfo: SharedInfo;
}) {
  const router = useRouter();
  const eligible = teams.filter((t) => t.eligible);
  const [divisionId, setDivisionId] = useState(divisions.length === 1 ? divisions[0].id : "");
  const [teamId, setTeamId] = useState(eligible.length === 1 ? eligible[0].id : "");
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const setAnswer = (id: string, value: string | string[]) => setAnswers((a) => ({ ...a, [id]: value }));

  function validate(): string | null {
    if (!teamId) return "Pick a team to enter.";
    if (divisions.length > 0 && !divisionId) return "Pick a division.";
    for (const f of teamFields) {
      if (!f.required) continue;
      const v = answers[f.id];
      const empty = v == null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
      if (empty) return `Please answer: ${f.label}`;
    }
    return null;
  }

  async function submit() {
    const v = validate();
    if (v) {
      setErr(v);
      return;
    }
    setSubmitting(true);
    setErr(null);
    try {
      const res = await signUpTeam(tournamentId, { teamId, divisionId: divisionId || null, teamAnswers: answers });
      if (res.ok) {
        router.push(`/e/${code}`);
        router.refresh();
      } else {
        setErr(res.error ?? "Couldn't enter the team.");
        setSubmitting(false);
      }
    } catch {
      setErr("Something went wrong. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6">
      <RegistrantSharedInfo info={sharedInfo} />

      <section>
        <h2 className="mb-1 text-sm font-bold text-ink">Choose your team</h2>
        <p className="mb-3 text-xs text-mute">
          Each team needs {rosterSize} main player{rosterSize === 1 ? "" : "s"}. Adjust your roster on the team page if a squad isn&rsquo;t eligible.
        </p>
        <div className="grid gap-2.5">
          {teams.map((t) => {
            const selected = teamId === t.id;
            return (
              <button
                key={t.id}
                type="button"
                disabled={!t.eligible}
                onClick={() => setTeamId(t.id)}
                className={`flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors ${selected ? "border-brand bg-tint-brand" : t.eligible ? "border-rule bg-surface hover:border-faint" : "border-rule bg-bg/50 opacity-70"}`}
              >
                <span className="flex items-center gap-2.5">
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${selected ? "bg-brand text-white" : "bg-bg text-mute"}`}>
                    <Users size={15} />
                  </span>
                  <span className="text-sm font-semibold text-ink">{t.name}</span>
                </span>
                {t.eligible ? selected ? <Check size={16} className="shrink-0 text-brand" /> : null : <span className="shrink-0 text-[11px] font-medium text-mute">{t.reason}</span>}
              </button>
            );
          })}
        </div>
      </section>

      {divisions.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-bold text-ink">Division</h2>
          <OptionCards
            ariaLabel="Division"
            value={divisionId}
            onChange={setDivisionId}
            options={divisions.map((d) => ({ value: d.id, label: d.name, hint: `${formatFee(d.fee_cents, d.fee_basis)}${d.description ? ` · ${d.description}` : ""}` }))}
          />
        </section>
      ) : null}

      {teamFields.length > 0 ? (
        <section>
          <h2 className="mb-1 text-sm font-bold text-ink">Team questions</h2>
          <p className="mb-3 text-xs text-mute">Answered once for the whole team.</p>
          <CustomFieldsRenderer fields={teamFields} answers={answers} onChange={setAnswer} />
        </section>
      ) : null}

      <div className="rounded-xl border border-rule bg-bg/40 p-3.5 text-xs leading-relaxed text-mute">
        After you enter, each player on the roster confirms their own spot — accepting the waiver and rules and answering any per-player questions.
      </div>

      <div className="flex items-center gap-3 border-t border-rule pt-5">
        <button type="button" onClick={submit} disabled={submitting || !teamId} className="press inline-flex items-center gap-1.5 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50">
          {submitting ? <Loader2 size={16} className="animate-spin" /> : null} Enter team
        </button>
        {err ? <span className="text-xs font-semibold text-brand-deep">{err}</span> : null}
      </div>
    </div>
  );
}
