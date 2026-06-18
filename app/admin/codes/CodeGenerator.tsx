"use client";

import { useActionState, useState } from "react";
import { Download, Copy, Check } from "lucide-react";
import { generateCodes, type GenerateCodesState } from "../actions";

const field =
  "w-full rounded-xl border border-rule bg-surface px-3 py-2.5 text-sm text-ink outline-none focus:border-brand";

export function CodeGenerator() {
  const [state, action, pending] = useActionState<GenerateCodesState, FormData>(generateCodes, {});
  const [codeType, setCodeType] = useState<"invite" | "investor">("invite");
  const [copied, setCopied] = useState(false);

  const today = new Date().toISOString().slice(0, 10);

  function download() {
    if (!state.codes?.length) return;
    const label = state.codeType === "investor" ? "investor" : "invite";
    const text = `Klimr ${label} codes — generated ${today}\n${"-".repeat(40)}\n${state.codes.join("\n")}\n`;
    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `klimr-${label}-codes-${today}.txt`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  }

  async function copy() {
    if (!state.codes?.length) return;
    try {
      await navigator.clipboard.writeText(state.codes.join("\n"));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard unavailable */
    }
  }

  return (
    <div className="rounded-2xl border border-rule bg-surface p-4 sm:p-5">
      <form action={action}>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="kicker text-faint">Code type</span>
            <select
              name="codeType"
              value={codeType}
              onChange={(e) => setCodeType(e.target.value === "investor" ? "investor" : "invite")}
              className={`mt-1 ${field}`}
            >
              <option value="invite">Invite — site access (klimr.com)</option>
              <option value="investor">Investor — vision portal</option>
            </select>
          </label>
          <label className="block">
            <span className="kicker text-faint">How many</span>
            <input name="count" type="number" min={1} max={200} defaultValue={1} className={`mt-1 ${field}`} />
          </label>
          {codeType === "invite" ? (
            <label className="block">
              <span className="kicker text-faint">Uses per code</span>
              <input name="maxUses" type="number" min={1} defaultValue={1} className={`mt-1 ${field}`} />
            </label>
          ) : null}
          <label className="block">
            <span className="kicker text-faint">Note (optional)</span>
            <input
              name="note"
              maxLength={80}
              placeholder={codeType === "investor" ? "seed round" : "first testers"}
              className={`mt-1 ${field}`}
            />
          </label>
        </div>

        <button
          type="submit"
          disabled={pending}
          className="press mt-4 rounded-full bg-ink px-5 py-2.5 text-sm font-semibold text-surface transition-colors hover:bg-ink-soft disabled:opacity-60"
        >
          {pending ? "Generating…" : "Generate codes"}
        </button>
      </form>

      {state.error ? <p className="mt-3 text-sm text-brand-deep">{state.error}</p> : null}

      {state.ok && state.codes && state.codes.length > 0 ? (
        <div className="mt-5 rounded-xl border border-rule bg-[#fafafa] p-4">
          <div className="flex items-center justify-between gap-2">
            <span className="kicker text-faint">
              {state.codes.length} new {state.codeType} code{state.codes.length === 1 ? "" : "s"}
            </span>
            <div className="flex gap-1.5">
              <button
                type="button"
                onClick={copy}
                className="press inline-flex items-center gap-1 rounded-full border border-rule px-3 py-1.5 text-xs font-semibold text-mute hover:text-ink"
              >
                {copied ? <Check size={13} /> : <Copy size={13} />} {copied ? "Copied" : "Copy"}
              </button>
              <button
                type="button"
                onClick={download}
                className="press inline-flex items-center gap-1 rounded-full bg-ink px-3 py-1.5 text-xs font-semibold text-surface hover:bg-ink-soft"
              >
                <Download size={13} /> Download .txt
              </button>
            </div>
          </div>
          <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words font-mono text-sm leading-relaxed text-ink">{state.codes.join("\n")}</pre>
        </div>
      ) : null}
    </div>
  );
}
