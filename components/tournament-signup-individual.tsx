"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check } from "lucide-react";
import { OptionCards } from "@/components/form-kit";
import { CustomFieldsRenderer, type AnswerMap } from "@/components/custom-fields-renderer";
import { signUpIndividual } from "@/app/tournaments/actions";
import { formatFee, type CustomFieldRow, type DivisionRow } from "@/lib/tournament";

export function IndividualSignupForm({
  tournamentId,
  code,
  divisions,
  fields,
  waiverText,
  rulesText,
  requireWaiver,
  requireRules,
}: {
  tournamentId: string;
  code: string;
  divisions: DivisionRow[];
  fields: CustomFieldRow[];
  waiverText: string;
  rulesText: string;
  requireWaiver: boolean;
  requireRules: boolean;
}) {
  const router = useRouter();
  const [divisionId, setDivisionId] = useState(divisions.length === 1 ? divisions[0].id : "");
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [acceptWaiver, setAcceptWaiver] = useState(false);
  const [acceptRules, setAcceptRules] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const setAnswer = (id: string, value: string | string[]) => setAnswers((a) => ({ ...a, [id]: value }));

  function validate(): string | null {
    if (divisions.length > 0 && !divisionId) return "Pick a division.";
    for (const f of fields) {
      if (!f.required) continue;
      const v = answers[f.id];
      const empty = v == null || (typeof v === "string" && v.trim() === "") || (Array.isArray(v) && v.length === 0);
      if (empty) return `Please answer: ${f.label}`;
    }
    if (waiverText && requireWaiver && !acceptWaiver) return "Please accept the waiver to continue.";
    if (rulesText && requireRules && !acceptRules) return "Please acknowledge the rules to continue.";
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
      const res = await signUpIndividual(tournamentId, { divisionId: divisionId || null, answers, acceptWaiver, acceptRules });
      if (res.ok) {
        router.push(`/e/${code}`);
        router.refresh();
      } else {
        setErr(res.error ?? "Couldn't register.");
        setSubmitting(false);
      }
    } catch {
      setErr("Something went wrong. Try again.");
      setSubmitting(false);
    }
  }

  return (
    <div className="grid gap-6">
      {divisions.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-bold text-ink">Choose a division</h2>
          <OptionCards
            ariaLabel="Division"
            value={divisionId}
            onChange={setDivisionId}
            options={divisions.map((d) => ({ value: d.id, label: d.name, hint: `${formatFee(d.fee_cents, d.fee_basis)}${d.description ? ` · ${d.description}` : ""}` }))}
          />
        </section>
      ) : null}

      {fields.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-bold text-ink">Your details</h2>
          <CustomFieldsRenderer fields={fields} answers={answers} onChange={setAnswer} />
        </section>
      ) : null}

      {waiverText ? (
        <section>
          <h2 className="mb-2 text-sm font-bold text-ink">Waiver</h2>
          <div className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-xl border border-rule bg-bg/40 p-3.5 text-xs leading-relaxed text-ink-soft">{waiverText}</div>
          <button type="button" onClick={() => setAcceptWaiver((v) => !v)} className="mt-3 flex items-center gap-2.5 text-left text-sm font-medium text-ink-soft">
            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${acceptWaiver ? "border-brand bg-brand text-white" : "border-faint"}`}>{acceptWaiver ? <Check size={13} /> : null}</span>
            I accept the waiver{requireWaiver ? <span className="text-brand"> *</span> : null}
          </button>
        </section>
      ) : null}

      {rulesText ? (
        <section>
          <h2 className="mb-2 text-sm font-bold text-ink">Rules</h2>
          <div className="max-h-44 overflow-y-auto whitespace-pre-wrap rounded-xl border border-rule bg-bg/40 p-3.5 text-xs leading-relaxed text-ink-soft">{rulesText}</div>
          <button type="button" onClick={() => setAcceptRules((v) => !v)} className="mt-3 flex items-center gap-2.5 text-left text-sm font-medium text-ink-soft">
            <span className={`grid h-5 w-5 shrink-0 place-items-center rounded border ${acceptRules ? "border-brand bg-brand text-white" : "border-faint"}`}>{acceptRules ? <Check size={13} /> : null}</span>
            I acknowledge the rules{requireRules ? <span className="text-brand"> *</span> : null}
          </button>
        </section>
      ) : null}

      <div className="flex items-center gap-3 border-t border-rule pt-5">
        <button type="button" onClick={submit} disabled={submitting} className="press inline-flex items-center gap-1.5 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50">
          {submitting ? <Loader2 size={16} className="animate-spin" /> : null} Complete sign-up
        </button>
        {err ? <span className="text-xs font-semibold text-brand-deep">{err}</span> : null}
      </div>
    </div>
  );
}
