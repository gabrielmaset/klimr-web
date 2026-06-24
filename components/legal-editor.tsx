"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Check } from "lucide-react";
import { Toggle } from "@/components/form-kit";
import { updateTournamentDraft } from "@/app/tournaments/actions";

type LegalInit = { waiver_text: string; rules_text: string; require_waiver: boolean; require_rules: boolean };

export function LegalEditor({ tournamentId, initial }: { tournamentId: string; initial: LegalInit }) {
  const router = useRouter();
  const [waiver, setWaiver] = useState(initial.waiver_text);
  const [rules, setRules] = useState(initial.rules_text);
  const [reqWaiver, setReqWaiver] = useState(initial.require_waiver);
  const [reqRules, setReqRules] = useState(initial.require_rules);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setErr(null);
    const res = await updateTournamentDraft(tournamentId, {
      format_config: { legal: { waiver_text: waiver.trim(), rules_text: rules.trim(), require_waiver: reqWaiver, require_rules: reqRules } },
    });
    if (res.ok) {
      setSavedAt(new Date().toLocaleTimeString([], { hour: "numeric", minute: "2-digit" }));
      router.refresh();
    } else setErr(res.error ?? "Couldn't save.");
    setSaving(false);
  }

  const inputCls = "w-full rounded-xl border border-rule bg-bg px-3.5 py-2.5 text-sm text-ink outline-none transition focus:border-brand";

  return (
    <div className="rounded-3xl border border-rule bg-surface p-5 sm:p-6">
      <div className="grid gap-5">
        <div>
          <label className="mb-1.5 block text-sm font-semibold text-ink">Liability waiver</label>
          <textarea className={`${inputCls} min-h-36 resize-y`} value={waiver} onChange={(e) => setWaiver(e.target.value)} placeholder="Liability waiver text participants accept when they register…" />
          <div className="mt-2">
            <Toggle checked={reqWaiver} onChange={setReqWaiver} label="Require waiver acceptance" description="Each participant must accept the waiver before they're confirmed." />
          </div>
        </div>

        <div className="border-t border-rule pt-5">
          <label className="mb-1.5 block text-sm font-semibold text-ink">Rules</label>
          <textarea className={`${inputCls} min-h-36 resize-y`} value={rules} onChange={(e) => setRules(e.target.value)} placeholder="Event rules, format details, code of conduct…" />
          <div className="mt-2">
            <Toggle checked={reqRules} onChange={setReqRules} label="Require rules acknowledgement" description="Each participant must acknowledge the rules before they're confirmed." />
          </div>
        </div>
      </div>

      <div className="mt-5 flex items-center gap-3 border-t border-rule pt-4">
        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="press inline-flex items-center gap-1.5 rounded-xl bg-ink px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-ink-soft disabled:opacity-50"
        >
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Check size={16} />} Save legal
        </button>
        {savedAt ? <span className="text-xs font-medium text-success">Saved {savedAt}</span> : null}
        {err ? <span className="text-xs font-semibold text-brand-deep">{err}</span> : null}
      </div>
    </div>
  );
}
