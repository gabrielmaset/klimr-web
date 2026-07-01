"use client";

import { useState, useTransition } from "react";
import { Loader2, AlertTriangle } from "lucide-react";

function genCode(len = 4): string {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < len; i++) out += A[Math.floor(Math.random() * A.length)];
  return out;
}

/**
 * Two-factor destructive confirmation: the user must type a fixed word (CANCEL or DELETE)
 * AND a freshly generated random code shown on screen. Used for cancelling events/tournaments
 * and disbanding teams. `onConfirm` does the work (and any navigation/revalidation); return
 * an { error } to surface a message, or nothing on success.
 */
export function DangerConfirm({
  word,
  triggerLabel,
  triggerClassName,
  triggerIcon,
  heading,
  description,
  consequences,
  confirmLabel,
  onConfirm,
}: {
  word: "CANCEL" | "DELETE";
  triggerLabel: string;
  triggerClassName?: string;
  triggerIcon?: React.ReactNode;
  heading: string;
  description: string;
  consequences?: string[];
  confirmLabel: string;
  onConfirm: () => Promise<{ error?: string } | void>;
}) {
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [wordInput, setWordInput] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const ready = wordInput.trim().toUpperCase() === word && codeInput.trim().toUpperCase() === code && code.length > 0;

  const openModal = () => {
    setCode(genCode());
    setWordInput("");
    setCodeInput("");
    setErr(null);
    setOpen(true);
  };
  const close = () => setOpen(false);

  const confirm = () => {
    if (!ready) return;
    setErr(null);
    start(async () => {
      const res = await onConfirm();
      if (res && "error" in res && res.error) {
        setErr(res.error);
        return;
      }
      setOpen(false);
    });
  };

  return (
    <>
      <button
        type="button"
        onClick={openModal}
        className={triggerClassName ?? "press inline-flex items-center gap-1.5 rounded-full border border-rule bg-surface px-4 py-2 text-sm font-semibold text-mute transition-colors hover:border-[#dc2626] hover:text-[#dc2626]"}
      >
        {triggerIcon} {triggerLabel}
      </button>
      {open ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center" role="dialog" aria-modal="true">
          <button type="button" aria-hidden tabIndex={-1} onClick={close} className="absolute inset-0 cursor-default" />
          <div className="relative w-full max-w-md rounded-3xl border border-rule bg-surface p-6 shadow-xl">
            <div className="flex items-center gap-2.5">
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[#fef2f2] text-[#dc2626]">
                <AlertTriangle size={18} />
              </span>
              <h2 className="font-display text-lg text-ink">{heading}</h2>
            </div>
            <p className="mt-3 text-sm leading-relaxed text-ink-soft">{description}</p>
            {consequences?.length ? (
              <ul className="mt-3 space-y-1.5">
                {consequences.map((c, i) => (
                  <li key={i} className="flex gap-2 text-xs text-mute">
                    <span className="text-faint">•</span>
                    <span>{c}</span>
                  </li>
                ))}
              </ul>
            ) : null}
            <div className="mt-5 space-y-3">
              <div>
                <label className="mb-1 block text-xs font-semibold text-mute">
                  Type <span className="font-mono font-bold text-ink">{word}</span> to confirm
                </label>
                <input
                  value={wordInput}
                  onChange={(e) => setWordInput(e.target.value)}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder={word}
                  className="w-full rounded-xl border border-rule bg-bg px-3.5 py-2.5 text-sm text-ink outline-none focus:border-[#dc2626]"
                />
              </div>
              <div>
                <label className="mb-1 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-mute">
                  Then type this code:
                  <span className="select-all rounded-md bg-ink px-2 py-0.5 font-mono text-sm font-bold tracking-[0.25em] text-white">{code}</span>
                </label>
                <input
                  value={codeInput}
                  onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
                  autoComplete="off"
                  autoCapitalize="characters"
                  spellCheck={false}
                  placeholder={code}
                  className="w-full rounded-xl border border-rule bg-bg px-3.5 py-2.5 text-center font-mono text-sm font-bold tracking-[0.25em] text-ink outline-none focus:border-[#dc2626]"
                />
              </div>
            </div>
            {err ? <p className="mt-3 rounded-lg bg-[#fef2f2] px-3 py-2 text-xs font-semibold text-[#b91c1c]">{err}</p> : null}
            <div className="mt-5 flex items-center justify-end gap-2">
              <button type="button" onClick={close} disabled={pending} className="press rounded-full px-4 py-2 text-sm font-semibold text-mute hover:text-ink">
                Keep it
              </button>
              <button
                type="button"
                onClick={confirm}
                disabled={!ready || pending}
                className="press inline-flex items-center gap-1.5 rounded-full bg-[#dc2626] px-5 py-2 text-sm font-semibold text-white transition-colors hover:bg-[#b91c1c] disabled:opacity-40"
              >
                {pending ? <Loader2 size={15} className="animate-spin" /> : null} {confirmLabel}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
