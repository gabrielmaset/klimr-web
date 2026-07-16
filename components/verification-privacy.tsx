import { Check, X } from "lucide-react";

/** The verification data promise, stated plainly — the X/Persona/Stripe model:
 *  documents go straight to the verification partner over an encrypted
 *  session; the platform receives only the outcome. Klimr's architecture
 *  matches the words: there is no code path that writes an ID image, selfie,
 *  or barcode payload to our storage. */
export function VerificationDataPanel({ compact }: { compact?: boolean }) {
  const keep = [
    "Your status — unverified, in review, or verified",
    "When that status changed",
    "A partner reference ID, for audit only",
  ];
  const never = [
    "ID document scans or photos",
    "Selfie or biometric data",
    "License barcode contents or document numbers",
  ];
  return (
    <div className={`rounded-2xl border border-rule bg-surface ${compact ? "p-4" : "p-5"}`}>
      <p className={`font-bold text-ink ${compact ? "text-[14px]" : "text-[15px]"}`}>Your documents never touch Klimr&rsquo;s servers.</p>
      <p className={`mt-1 leading-relaxed text-mute ${compact ? "text-[12.5px]" : "text-[13.5px]"}`}>
        Identity checks run directly with our verification partner over an encrypted session — Klimr receives only the outcome. Prefer no cameras or biometrics?
        The manual review path is always available.
      </p>
      <div className={`mt-3 grid gap-3 ${compact ? "" : "sm:grid-cols-2"}`}>
        <div className="rounded-xl border border-[#CFE3D2] bg-[#F2F8F3] px-3.5 py-3">
          <p className="font-mono text-[9.5px] font-bold uppercase tracking-[.14em] text-[#1F6B33]">What we store</p>
          <ul className="mt-1.5 space-y-1">
            {keep.map((k) => (
              <li key={k} className={`flex items-start gap-1.5 text-ink-soft ${compact ? "text-[12.5px]" : "text-[13px]"}`}>
                <Check size={13} strokeWidth={3} className="mt-0.5 shrink-0 text-[#1F6B33]" aria-hidden /> {k}
              </li>
            ))}
          </ul>
        </div>
        <div className="rounded-xl border border-[#EBD3C6] bg-[#FBF2ED] px-3.5 py-3">
          <p className="font-mono text-[9.5px] font-bold uppercase tracking-[.14em] text-brand-deep">What we never store</p>
          <ul className="mt-1.5 space-y-1">
            {never.map((k) => (
              <li key={k} className={`flex items-start gap-1.5 text-ink-soft ${compact ? "text-[12.5px]" : "text-[13px]"}`}>
                <X size={13} strokeWidth={3} className="mt-0.5 shrink-0 text-brand-deep" aria-hidden /> {k}
              </li>
            ))}
          </ul>
        </div>
      </div>
      {compact ? null : (
        <p className="mt-3 text-[12px] leading-relaxed text-mute">
          Documents are retained by the verification partner under their own policy; you can request deletion anytime through Klimr support, and we&rsquo;ll relay it to the partner.
        </p>
      )}
    </div>
  );
}
