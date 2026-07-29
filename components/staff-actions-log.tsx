"use client";

import { useState } from "react";
import { X } from "lucide-react";

export type StaffAction = {
  id: string;
  action: string;
  created_at: string;
  detail: string | null;
  actorName: string | null;
  targetName: string | null;
  targetRef: string | null;
  meta: Record<string, unknown> | null;
};

// Human labels for the JSONB keys we write in logAdminAction meta.
const FIELD_LABEL: Record<string, string> = {
  subject_name: "Subject",
  subject_email: "Subject email",
  previous_status: "Previous status",
  new_status: "New status",
  method: "Method",
  handoff_count: "Handoffs used",
  role: "Role",
  credential_type: "Credential type",
  credential_id: "Credential ID",
  credential_jurisdiction: "Jurisdiction",
  verification_url: "Verification URL",
  applicant_note: "Applicant note",
  reviewer_note: "Reviewer note",
  credential_expires: "Credential expires",
  decision: "Decision",
  suspended_until: "Suspended until",
  reason: "Reason",
};

function titleFor(action: string): string {
  const [head] = action.split(":");
  const map: Record<string, string> = {
    verification: "Identity verification",
    account: "Account status change",
    provider_app: "Professional application review",
    provider: "Professional status change",
    feed: "Feed management",
    tournament: "Tournament action",
    auth: "Account access",
  };
  return map[head] ?? "Staff action";
}

function fmt(value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (typeof value === "string") {
    // ISO timestamp → local
    if (/^\d{4}-\d{2}-\d{2}T/.test(value)) {
      const d = new Date(value);
      if (!Number.isNaN(d.getTime())) return d.toLocaleString("en-US");
    }
    return value;
  }
  return String(value);
}

export function StaffActionsLog({ actions }: { actions: StaffAction[] }) {
  const [open, setOpen] = useState<StaffAction | null>(null);

  const handoffs = (open?.meta?.handoffs as Array<Record<string, unknown>> | undefined) ?? [];
  const scalarEntries = open?.meta
    ? Object.entries(open.meta).filter(([k, v]) => k !== "handoffs" && v !== null && v !== undefined && v !== "")
    : [];

  return (
    <>
      <div className="max-h-[28rem] space-y-1.5 overflow-y-auto rounded-2xl border border-rule/60 bg-bg/30 p-2">
        {actions.map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setOpen(a)}
            className="press block w-full rounded-xl border border-rule bg-surface px-4 py-2.5 text-left text-sm shadow-e1 transition-colors hover:border-rule-2 hover:bg-hover"
          >
            <div className="flex items-center justify-between gap-3">
              <span className="font-mono text-ink">{a.action}</span>
              <span className="shrink-0 text-faint">{new Date(a.created_at).toLocaleString("en-US")}</span>
            </div>
            {a.detail || a.actorName || a.targetName ? (
              <p className="mt-0.5 text-xs text-mute">
                {a.targetName ? `${a.targetName}` : ""}
                {a.detail ? `${a.targetName ? " · " : ""}${a.detail}` : ""}
                {a.actorName ? `${a.detail || a.targetName ? " · " : ""}by ${a.actorName}` : ""}
              </p>
            ) : null}
          </button>
        ))}
      </div>

      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 p-4 backdrop-blur-sm"
          onClick={() => setOpen(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="max-h-[85vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-rule bg-surface p-6 shadow-e3"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="kicker text-faint">{titleFor(open.action)}</p>
                <h2 className="mt-1 font-mono text-lg font-bold text-ink">{open.action}</h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(null)}
                aria-label="Close"
                className="press grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-rule-2 text-mute hover:bg-hover"
              >
                <X size={15} />
              </button>
            </div>

            <dl className="mt-4 space-y-0">
              <Row label="When" value={new Date(open.created_at).toLocaleString("en-US", { dateStyle: "full", timeStyle: "medium" })} />
              <Row label="Performed by" value={open.actorName ?? "—"} />
              {open.targetName ? <Row label="Target user" value={open.targetName} /> : null}
              {open.targetRef ? <Row label="Reference" value={open.targetRef} mono /> : null}
              {open.detail ? <Row label="Note" value={open.detail} /> : null}
            </dl>

            {scalarEntries.length > 0 ? (
              <>
                <p className="kicker mt-5 text-faint">Action evidence</p>
                <dl className="mt-1.5 space-y-0">
                  {scalarEntries.map(([k, v]) => (
                    <Row
                      key={k}
                      label={FIELD_LABEL[k] ?? k.replace(/_/g, " ")}
                      value={fmt(v)}
                      mono={k === "credential_id" || k === "subject_email"}
                    />
                  ))}
                </dl>
              </>
            ) : null}

            {handoffs.length > 0 ? (
              <>
                <p className="kicker mt-5 text-faint">Identity handoffs ({handoffs.length})</p>
                <div className="mt-1.5 space-y-1.5">
                  {handoffs.map((h, i) => (
                    <div key={i} className="rounded-lg border border-rule-soft bg-bg px-3 py-2 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-ink">#{fmt(h.ref)}</span>
                        <span className={h.completed ? "font-semibold text-success" : "text-faint"}>
                          {h.completed ? "Completed" : "Not completed"}
                        </span>
                      </div>
                      <p className="mt-0.5 text-mute">
                        Started {fmt(h.started)}
                        {h.completed ? ` · Verified ${fmt(h.completed)}` : ""}
                      </p>
                    </div>
                  ))}
                </div>
              </>
            ) : null}

            {!scalarEntries.length && !handoffs.length && !open.detail ? (
              <p className="mt-4 rounded-lg border border-rule-soft bg-bg px-3 py-2.5 text-xs text-mute">
                This action predates structured evidence capture. New actions of this type record full detail.
              </p>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-4 border-b border-rule-soft py-2 last:border-b-0">
      <dt className="w-32 shrink-0 text-xs font-semibold text-mute">{label}</dt>
      <dd className={`min-w-0 flex-1 break-words text-sm text-ink ${mono ? "font-mono text-[13px]" : ""}`}>{value}</dd>
    </div>
  );
}
