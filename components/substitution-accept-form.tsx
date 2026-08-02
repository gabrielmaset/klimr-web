"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check } from "lucide-react";
import { CustomFieldsRenderer, type AnswerMap } from "@/components/custom-fields-renderer";
import { respondSubstitution } from "@/app/tournaments/substitution-actions";
import type { CustomFieldRow } from "@/lib/tournament";

/** The invited substitute's consent screen. Accepting collects the re-asked
 *  per-player questions + waiver/rules and executes the swap atomically
 *  server-side (deadline re-checked in that same transaction). Declining
 *  changes nothing and tells the requester. */
export function SubstitutionAcceptForm({
  requestId,
  code,
  fields,
  waiverText,
  rulesText,
  requireWaiver,
  requireRules,
}: {
  requestId: string;
  code: string;
  fields: CustomFieldRow[];
  waiverText: string;
  rulesText: string;
  requireWaiver: boolean;
  requireRules: boolean;
}) {
  const router = useRouter();
  const [answers, setAnswers] = useState<AnswerMap>({});
  const [acceptWaiver, setAcceptWaiver] = useState(false);
  const [acceptRules, setAcceptRules] = useState(false);
  const [busy, setBusy] = useState<"accept" | "decline" | null>(null);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const setAnswer = (id: string, value: string | string[]) => setAnswers((a) => ({ ...a, [id]: value }));

  function validate(): string | null {
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

  async function accept() {
    const v = validate();
    if (v) {
      setErr(v);
      return;
    }
    setBusy("accept");
    setErr(null);
    try {
      const res = await respondSubstitution(requestId, { accept: true, answers, acceptWaiver, acceptRules });
      if (res.ok) {
        router.push(`/e/${code}`);
        router.refresh();
      } else {
        setErr(res.error ?? "Couldn't complete the substitution.");
        setBusy(null);
      }
    } catch {
      setErr("Something went wrong. Try again.");
      setBusy(null);
    }
  }

  async function decline() {
    setBusy("decline");
    setErr(null);
    try {
      const res = await respondSubstitution(requestId, { accept: false });
      if (res.ok) {
        router.push(`/e/${code}`);
        router.refresh();
      } else {
        setErr(res.error ?? "Couldn't record your response.");
        setBusy(null);
      }
    } catch {
      setErr("Something went wrong. Try again.");
      setBusy(null);
    }
  }

  return (
    <div className="grid gap-6">
      {fields.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-bold text-ink">Your details</h2>
          <p className="mb-3 text-xs text-mute">The organizer asks every substitute to answer these — the previous player&rsquo;s answers never carry over.</p>
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

      <div className="flex flex-wrap items-center gap-3 border-t border-rule pt-5">
        <button
          type="button"
          onClick={accept}
          disabled={busy !== null}
          className="press inline-flex items-center gap-1.5 rounded-xl bg-brand px-5 py-2.5 text-sm font-semibold text-white hover:bg-brand-deep disabled:opacity-50"
        >
          {busy === "accept" ? <Loader2 size={16} className="animate-spin" /> : null} Accept &amp; join the roster
        </button>
        {confirmDecline ? (
          <span className="inline-flex items-center gap-2">
            <span className="text-xs font-semibold text-ink-soft">Decline this request?</span>
            <button
              type="button"
              onClick={decline}
              disabled={busy !== null}
              className="press rounded-[9px] border border-rule px-3 py-1.5 text-xs font-semibold text-[#B42318] disabled:opacity-50"
            >
              {busy === "decline" ? <Loader2 size={12} className="inline animate-spin" /> : null} Yes, decline
            </button>
            <button type="button" onClick={() => setConfirmDecline(false)} className="press rounded-[9px] border border-rule px-3 py-1.5 text-xs font-semibold text-mute">
              Keep looking
            </button>
          </span>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDecline(true)}
            disabled={busy !== null}
            className="press rounded-xl border border-rule px-5 py-2.5 text-sm font-semibold text-mute hover:text-ink disabled:opacity-50"
          >
            Decline
          </button>
        )}
        {err ? <span className="text-xs font-semibold text-brand-deep">{err}</span> : null}
      </div>
    </div>
  );
}
