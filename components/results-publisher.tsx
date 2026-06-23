"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Globe, ExternalLink, RefreshCw, Radio } from "lucide-react";
import { Toggle } from "@/components/form-kit";
import { publishResults, unpublishResults, setResultsAutoPublish } from "@/app/tournaments/actions";

/* Event-level publish for the whole competition view (every division's pools +
 * brackets) to the public page. After the first publish, an auto-publish toggle
 * lets the public follow live scores without manual re-publishing. */
export function ResultsPublisher({
  tournamentId,
  publicCode,
  initialPublished,
  initialAuto,
  builtAtText,
  canPublish,
}: {
  tournamentId: string;
  publicCode: string | null;
  initialPublished: boolean;
  initialAuto: boolean;
  builtAtText: string | null;
  canPublish: boolean;
}) {
  const router = useRouter();
  const [published, setPublished] = useState(initialPublished);
  const [auto, setAuto] = useState(initialAuto);
  const [busy, setBusy] = useState<null | "publish" | "update" | "unpublish" | "auto">(null);
  const [err, setErr] = useState<string | null>(null);

  async function doPublish(kind: "publish" | "update") {
    setBusy(kind);
    setErr(null);
    const res = await publishResults(tournamentId);
    if (res.ok) {
      setPublished(true);
      router.refresh();
    } else setErr(res.error ?? "Failed.");
    setBusy(null);
  }

  async function doUnpublish() {
    setBusy("unpublish");
    setErr(null);
    const res = await unpublishResults(tournamentId);
    if (res.ok) {
      setPublished(false);
      setAuto(false);
      router.refresh();
    } else setErr(res.error ?? "Failed.");
    setBusy(null);
  }

  async function toggleAuto(v: boolean) {
    setBusy("auto");
    setErr(null);
    setAuto(v);
    const res = await setResultsAutoPublish(tournamentId, v);
    if (res.ok) router.refresh();
    else {
      setAuto(!v);
      setErr(res.error ?? "Failed.");
    }
    setBusy(null);
  }

  return (
    <section className="rounded-3xl border border-rule bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${published ? "bg-tint-success text-success" : "bg-bg text-mute"}`}>
            <Globe size={18} />
          </span>
          <div>
            <h2 className="text-base font-bold text-ink">Public results</h2>
            {published ? (
              <p className="text-xs text-mute">
                Live on your event page{builtAtText ? ` · updated ${builtAtText}` : ""}.
              </p>
            ) : (
              <p className="max-w-md text-xs text-mute">Publish the pools and brackets to your public event page so players and fans can follow standings and results.</p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {published && publicCode ? (
            <a
              href={`/e/${publicCode}`}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 rounded-xl border border-rule bg-bg px-3 py-2 text-sm font-semibold text-mute transition hover:text-ink"
            >
              <ExternalLink size={15} /> View page
            </a>
          ) : null}
          {published ? (
            <>
              <button
                type="button"
                onClick={() => doPublish("update")}
                disabled={!!busy}
                className="press inline-flex items-center gap-1.5 rounded-xl bg-ink px-3.5 py-2 text-sm font-semibold text-white transition hover:bg-ink-soft disabled:opacity-50"
              >
                {busy === "update" ? <Loader2 size={15} className="animate-spin" /> : <RefreshCw size={15} />} Update now
              </button>
              <button type="button" onClick={doUnpublish} disabled={!!busy} className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-sm font-medium text-mute transition hover:text-ink disabled:opacity-50">
                {busy === "unpublish" ? <Loader2 size={15} className="animate-spin" /> : null} Unpublish
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => doPublish("publish")}
              disabled={!!busy || !canPublish}
              title={canPublish ? undefined : "Draw at least one division first"}
              className="press inline-flex items-center gap-1.5 rounded-xl bg-brand px-4 py-2 text-sm font-semibold text-white transition hover:bg-brand-deep disabled:opacity-50"
            >
              {busy === "publish" ? <Loader2 size={15} className="animate-spin" /> : <Globe size={15} />} Publish to public
            </button>
          )}
        </div>
      </div>

      {!canPublish && !published ? <p className="mt-3 text-[11px] text-mute">Available once a pool or bracket has been drawn.</p> : null}
      {err ? <p className="mt-3 text-xs font-semibold text-brand-deep">{err}</p> : null}

      {published ? (
        <div className="mt-4 rounded-2xl border border-rule bg-bg/50 p-4">
          <Toggle
            checked={auto}
            onChange={toggleAuto}
            label="Auto-publish results"
            description="As you enter scores, the public page updates automatically — no need to publish again each time."
          />
          <p className="mt-2 flex items-center gap-1.5 text-[11px] font-medium">
            {auto ? (
              <span className="inline-flex items-center gap-1.5 text-success">
                <Radio size={13} /> Following live — new scores appear on the public page as you record them.
              </span>
            ) : (
              <span className="text-mute">Auto-publish is off — use “Update now” to push the latest scores to the public page.</span>
            )}
          </p>
        </div>
      ) : null}
    </section>
  );
}
