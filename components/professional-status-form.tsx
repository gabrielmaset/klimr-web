"use client";

import { useState } from "react";
import { ShieldCheck, Info } from "lucide-react";
import { PROFESSIONAL_ROLES, roleMeta, ROLE_CATEGORY_LABEL, type RoleCategory } from "@/lib/professional-roles";
import { requestProfessionalStatus } from "@/app/settings/professional/actions";

const field = "w-full rounded-xl border border-rule bg-bg px-3 py-2.5 text-sm text-ink outline-none transition-colors focus:border-brand";
const labelCls = "mb-1 block text-xs font-semibold text-mute";

const CATEGORY_ORDER: RoleCategory[] = ["coaching", "health", "organizer"];

export function ProfessionalStatusForm({ existingRoles }: { existingRoles: string[] }) {
  const [role, setRole] = useState("");
  const meta = roleMeta(role);

  return (
    <form action={requestProfessionalStatus} className="space-y-5 rounded-2xl border border-rule bg-surface shadow-e1 p-5">
      <div>
        <h2 className="text-base font-bold text-ink">Request a professional status</h2>
        <p className="mt-1 text-sm text-mute">
          Pick the role you want recognized on your Klimr profile. Health and medical roles require proof of qualification, which our team verifies before approval.
        </p>
      </div>

      <label className="block">
        <span className={labelCls}>Role</span>
        <select name="role" value={role} onChange={(e) => setRole(e.target.value)} required className={field}>
          <option value="" disabled>
            Choose a role…
          </option>
          {CATEGORY_ORDER.map((cat) => (
            <optgroup key={cat} label={ROLE_CATEGORY_LABEL[cat]}>
              {PROFESSIONAL_ROLES.filter((r) => r.category === cat).map((r) => (
                <option key={r.key} value={r.key} disabled={existingRoles.includes(r.key)}>
                  {r.label}
                  {existingRoles.includes(r.key) ? " — already approved" : ""}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>

      {meta ? (
        <>
          <p className="text-sm text-ink-soft">{meta.blurb}</p>

          {meta.legalNote ? (
            <div className="flex items-start gap-2 rounded-xl border border-rule bg-bg/50 px-3.5 py-2.5">
              <Info size={14} className="mt-0.5 shrink-0 text-brand-deep" />
              <p className="text-[11px] leading-relaxed text-mute">{meta.legalNote}</p>
            </div>
          ) : null}

          <label className="block">
            <span className={labelCls}>Headline (shown on your profile)</span>
            <input name="headline" maxLength={120} placeholder="e.g. USPTA tennis coach · 10 yrs" className={field} />
          </label>

          <label className="block">
            <span className={labelCls}>About you (optional)</span>
            <textarea name="bio" rows={3} maxLength={600} placeholder="Experience, specialties, who you work with…" className={field} />
          </label>

          {/* Credential block */}
          {meta.requiresCredential || meta.credentialLabel ? (
            <div className="space-y-4 rounded-xl border border-rule bg-bg/40 p-4">
              <div className="flex items-center gap-2">
                <ShieldCheck size={15} className="text-brand-deep" />
                <span className="text-sm font-bold text-ink">{meta.requiresCredential ? "Proof of qualification (required)" : "Certification (optional)"}</span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block sm:col-span-2">
                  <span className={labelCls}>{meta.credentialLabel ?? "Credential / license number"}</span>
                  <input
                    name="credential_id"
                    required={meta.requiresCredential}
                    maxLength={80}
                    placeholder={meta.requiresCredential ? "License / certification number" : "Number (if any)"}
                    className={field}
                  />
                </label>
                <label className="block">
                  <span className={labelCls}>Issuing body</span>
                  <input name="credential_type" maxLength={120} defaultValue={meta.credentialOrg ?? ""} placeholder="e.g. CAMTC, CDR, BOC" className={field} />
                </label>
                <label className="block">
                  <span className={labelCls}>Jurisdiction</span>
                  <input name="credential_jurisdiction" maxLength={40} defaultValue="CA" placeholder="State / region" className={field} />
                </label>
                <label className="block sm:col-span-2">
                  <span className={labelCls}>Verification link (optional)</span>
                  <input name="verification_url" type="url" maxLength={300} placeholder="Public registry entry, e.g. CAMTC / state-board lookup URL" className={field} />
                  <span className="mt-1 block text-[11px] text-faint">A link to your entry in the official public registry speeds up review.</span>
                </label>
              </div>
            </div>
          ) : null}

          <label className="block">
            <span className={labelCls}>Anything else for our reviewers? (optional)</span>
            <textarea name="applicant_note" rows={2} maxLength={400} className={field} />

            <label className="grid gap-1.5">
              <span className="text-xs font-semibold text-ink-soft">Credential document <span className="font-mono text-[9px] font-bold uppercase tracking-wider text-faint">Optional</span></span>
              <input type="file" name="credential_doc" accept=".pdf,.png,.jpg,.jpeg" className="block w-full cursor-pointer rounded-[12px] border border-rule-2 bg-bg px-3 py-2.5 text-xs text-ink-soft file:mr-3 file:rounded-full file:border-0 file:bg-ink file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-surface" />
              <span className="text-[11px] text-faint">A copy of your license or certificate (PDF/JPG/PNG, ≤5 MB) — visible only to Klimr admins during review.</span>
            </label>
          </label>

          <div className="flex items-start gap-2 rounded-xl border border-brand/20 bg-tint-brand px-3.5 py-2.5">
            <ShieldCheck size={14} className="mt-0.5 shrink-0 text-brand-deep" />
            <p className="text-[11px] leading-relaxed text-brand-deep">
              Coming soon: to become a fully verified professional you&rsquo;ll also complete a government-ID + facial match and, for roles working with athletes, a background check. For now our team reviews your credential manually.
            </p>
          </div>

          <button className="press w-full rounded-full bg-brand px-6 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-brand-deep">
            Submit request
          </button>
        </>
      ) : null}
    </form>
  );
}
