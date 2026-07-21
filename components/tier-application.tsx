"use client";

import { useRef, useState, useTransition } from "react";
import { FileText, Loader2, Paperclip, Send, ShieldCheck, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { createBusinessDocUploadUrl, submitTierApplication, type TierDoc } from "@/app/business/actions";

const BUCKET = "business-docs";
const inputCls =
  "w-full rounded-[10px] border border-rule-2 bg-surface px-3 py-2 text-sm text-ink outline-none placeholder:text-faint focus:border-brand focus:ring-4 focus:ring-brand/15";

/** Apply for Sponsor-ready (Tier 2): the no-payments review — business
 *  documents, domain confirmation, brand-kit-bearing files if relevant, and
 *  terms acceptance. Files go to the PRIVATE bucket via single-use signed
 *  URLs: the server mints each URL only after a manager check and builds the
 *  path itself; reads happen only through manager-gated RLS or short-lived
 *  admin-minted links. */
export function TierApplication({ businessId }: { businessId: string }) {
  const [docs, setDocs] = useState<TierDoc[]>([]);
  const [domain, setDomain] = useState("");
  const [notes, setNotes] = useState("");
  const [terms, setTerms] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ ok?: boolean; text: string } | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const supabase = createClient();

  async function addFiles(list: FileList | null) {
    if (!list?.length) return;
    setMsg(null);
    setUploading(true);
    const next: TierDoc[] = [];
    for (const file of Array.from(list).slice(0, 8 - docs.length)) {
      if (file.size > 10 * 1024 * 1024) {
        setMsg({ text: `${file.name} is over 10 MB.` });
        continue;
      }
      const signed = await createBusinessDocUploadUrl(businessId, file.name, file.type);
      if (!signed.ok) {
        setMsg({ text: signed.error });
        continue;
      }
      const up = await supabase.storage.from(BUCKET).uploadToSignedUrl(signed.path, signed.token, file, { contentType: file.type });
      if (up.error) {
        setMsg({ text: `Couldn't upload ${file.name}.` });
        continue;
      }
      next.push({ path: signed.path, name: file.name, size: file.size });
    }
    if (next.length) setDocs((d) => [...d, ...next]);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function submit() {
    setMsg(null);
    start(async () => {
      const res = await submitTierApplication({ businessId, domain, notes, docs, termsAccepted: terms });
      if (res.error) setMsg({ text: res.error });
      else {
        setMsg({ ok: true, text: "Application submitted — review usually lands within a few days." });
        setDocs([]);
        setDomain("");
        setNotes("");
        setTerms(false);
      }
    });
  }

  return (
    <div className="mt-4 rounded-xl border border-rule bg-bg p-4">
      <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-faint">
        <ShieldCheck size={13} className="text-brand-deep" /> Apply for Sponsor-ready (Tier 2)
      </p>
      <p className="mt-1.5 text-[12.5px] leading-snug text-mute">
        The review checks four things: <span className="font-semibold text-ink">business documents</span> (registration,
        license, or equivalent), your <span className="font-semibold text-ink">website domain</span>, a{" "}
        <span className="font-semibold text-ink">brand kit</span> if you have one, and the{" "}
        <span className="font-semibold text-ink">sponsor terms</span>. No payment details — Klimr never moves money.
      </p>

      <div className="mt-3 space-y-2.5">
        <input value={domain} onChange={(e) => setDomain(e.target.value)} placeholder="Website domain — proshop.com" className={inputCls} />
        <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={500} placeholder="Anything the reviewer should know (optional)" className={inputCls} />

        <div>
          <input ref={fileRef} type="file" multiple accept="application/pdf,image/*" onChange={(e) => void addFiles(e.target.files)} className="hidden" id={`tierdocs-${businessId}`} />
          <label
            htmlFor={`tierdocs-${businessId}`}
            className="press inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-rule bg-surface px-3.5 py-2 text-sm font-semibold text-ink hover:border-faint"
          >
            {uploading ? <Loader2 size={14} className="animate-spin" /> : <Paperclip size={14} />} Attach documents
          </label>
          {docs.length ? (
            <ul className="mt-2 space-y-1">
              {docs.map((d) => (
                <li key={d.path} className="flex items-center justify-between gap-2 rounded-lg border border-rule bg-surface px-2.5 py-1.5 text-xs">
                  <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-ink">
                    <FileText size={12} className="shrink-0 text-faint" /> {d.name}
                    <span className="text-faint">· {(d.size / 1024).toFixed(0)} KB</span>
                  </span>
                  <button
                    type="button"
                    aria-label={`Remove ${d.name}`}
                    onClick={() => setDocs((x) => x.filter((y) => y.path !== d.path))}
                    className="press shrink-0 text-faint hover:text-danger"
                  >
                    <Trash2 size={12} />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>

        <label className="flex cursor-pointer items-start gap-2 text-[12.5px] leading-snug text-ink">
          <input type="checkbox" checked={terms} onChange={(e) => setTerms(e.target.checked)} className="mt-0.5 accent-[var(--color-brand)]" />
          <span>
            I accept the sponsor terms: sponsorships on Klimr are recorded relationships, targets must consent, the
            category policy applies, and no money moves through the platform.
          </span>
        </label>

        <button
          type="button"
          onClick={submit}
          disabled={pending || uploading}
          className="press inline-flex items-center gap-1.5 rounded-full bg-ink px-4 py-2 text-sm font-semibold text-cream hover:opacity-90 disabled:opacity-40"
        >
          {pending ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />} Submit for review
        </button>
        {msg ? <p className={`text-sm font-semibold ${msg.ok ? "text-success" : "text-danger"}`}>{msg.text}</p> : null}
      </div>
    </div>
  );
}
