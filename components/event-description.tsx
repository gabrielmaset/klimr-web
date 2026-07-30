"use client";

import { useState, useTransition } from "react";
import { Languages, Loader2 } from "lucide-react";
import { translateEventDescription } from "@/app/events/actions";

/** The event description panel, with an opt-in translation. When the text
 *  looks non-English (server heuristic — conservative), a discreet button
 *  offers a one-click English translation. NEVER automatic: the original is
 *  the source of truth and stays one tap away. Translations are cached on the
 *  event row, so repeat clicks are instant. */
export function EventDescription({
  eventId,
  html,
  plain,
  offerTranslate,
}: {
  eventId: string;
  html: string | null;
  plain: string;
  offerTranslate: boolean;
}) {
  const [translated, setTranslated] = useState<string | null>(null);
  const [showing, setShowing] = useState<"original" | "en">("original");
  const [err, setErr] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const translate = () => {
    if (pending) return;
    if (translated) {
      setShowing("en");
      return;
    }
    setErr(null);
    startTransition(async () => {
      const res = await translateEventDescription(eventId);
      if (!res.ok || !res.html) {
        setErr(res.error ?? "Translation failed — try again.");
        return;
      }
      setTranslated(res.html);
      setShowing("en");
    });
  };

  const showingEn = showing === "en" && translated;

  return (
    <section className="rounded-3xl border-l-4 border-l-brand border-y border-r border-rule bg-gradient-to-r from-bg/60 to-surface p-5 sm:p-6">
      {showingEn ? (
        <div className="rich-text" dangerouslySetInnerHTML={{ __html: translated! }} />
      ) : html ? (
        <div className="rich-text" dangerouslySetInnerHTML={{ __html: html }} />
      ) : (
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-ink-soft">{plain}</p>
      )}

      {offerTranslate || translated ? (
        <div className="mt-3.5 flex flex-wrap items-center gap-2.5 border-t border-rule-soft pt-3">
          {showingEn ? (
            <>
              <button
                type="button"
                onClick={() => setShowing("original")}
                className="press inline-flex h-7 items-center gap-1.5 rounded-[9px] border border-rule-2 bg-surface px-2.5 text-[11.5px] font-semibold text-mute transition-colors hover:text-ink"
              >
                <Languages size={12} /> Show original
              </button>
              <span className="font-mono text-[9px] font-semibold tracking-[0.14em] text-faint">TRANSLATED BY AI</span>
            </>
          ) : (
            <button
              type="button"
              onClick={translate}
              className="press inline-flex h-7 items-center gap-1.5 rounded-[9px] border border-rule-2 bg-surface px-2.5 text-[11.5px] font-semibold text-mute transition-colors hover:text-ink"
            >
              {pending ? <Loader2 size={12} className="animate-spin" /> : <Languages size={12} />}
              Translate to English
            </button>
          )}
          {err ? <span className="text-[11.5px] font-semibold text-danger">{err}</span> : null}
        </div>
      ) : null}
    </section>
  );
}
