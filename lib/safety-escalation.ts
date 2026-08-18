import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import type { EscalationResult } from "@/lib/safety-rules";
import { callExternal } from "@/lib/external";

/**
 * CSAE escalation path. Invoked when known-CSAM hash matching hits, or when the AI
 * classifier flags child sexual abuse / exploitation. It quarantines the bytes in a
 * PRIVATE bucket (never the public one), records a locked incident, alerts the
 * designated safety contact, and fires the NCMEC reporting hook.
 *
 * Handling rules (see SAFETY.md): suspected CSAM is never published, never served,
 * never forwarded, and never casually viewed. Preservation follows 18 U.S.C.
 * § 2258A(h) (90 days). The real CyberTipline submission requires ESP registration.
 */

const PRESERVE_DAYS = 90;

type EscalationInput = {
  uploaderId: string;
  bytes: Buffer;
  sha256: string;
  mediaType: string;
  kind: "csam_hash_match" | "ai_csae_flag";
  provider?: string;
  matchRef?: string;
  aiLabels?: string[];
};

async function alertSafetyContact(incidentId: string | null, input: EscalationInput): Promise<void> {
  const summary = {
    incidentId,
    kind: input.kind,
    provider: input.provider ?? "ai",
    sha256: input.sha256,
    uploaderId: input.uploaderId,
    at: new Date().toISOString(),
  };
  const hook = process.env.SAFETY_ALERT_WEBHOOK;
  if (hook) {
    try {
      // KCDX-056: had no timeout. This is a best-effort alert with a logging
      // fallback, so a slow endpoint should cost seconds, not the invocation.
      // Two retries because the alert genuinely matters and posting it twice is
      // an acceptable failure mode next to not posting it at all.
      await callExternal({ vendor: "safety-alert", timeoutMs: 5000, retries: 2 }, (signal) =>
        fetch(hook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(summary), signal }),
      );
      return;
    } catch {
      /* fall through to logging */
    }
  }
  // Last resort: server log. Configure SAFETY_ALERT_WEBHOOK (and a real reporting
  // pipeline) before launch so this is never the only signal.
  console.error("[safety] CSAE incident requires immediate review:", JSON.stringify(summary));
}

async function reportToNCMEC(
  admin: ReturnType<typeof createAdminClient>,
  incidentId: string | null,
  input: EscalationInput,
): Promise<void> {
  // Legal reporting path. A real submission requires NCMEC ESP registration and the
  // CyberTipline API (report.cybertip.org). If you've wired a reporting endpoint that
  // performs that submission, set NCMEC_REPORT_WEBHOOK; otherwise the incident stays
  // 'open' and the safety contact is responsible for the legally-required manual report.
  const endpoint = process.env.NCMEC_REPORT_WEBHOOK;
  if (!endpoint || !incidentId) {
    console.error("[safety] NCMEC report REQUIRED (manual) for incident:", incidentId);
    return;
  }
  try {
    // KRA-014: had no deadline. A hung reporting endpoint held the invocation
    // that was in the middle of a legally-required escalation. 10s, and
    // deliberately NO retry — a duplicated CyberTipline submission is its own
    // problem, and the catch below already routes failure to a manual report.
    const res = await callExternal({ vendor: "ncmec", timeoutMs: 10000, retries: 0 }, (signal) =>
      fetch(endpoint, {
      signal,
      method: "POST",
      headers: {
        "content-type": "application/json",
        ...(process.env.NCMEC_REPORT_TOKEN ? { authorization: `Bearer ${process.env.NCMEC_REPORT_TOKEN}` } : {}),
      },
      body: JSON.stringify({
        incidentId,
        kind: input.kind,
        sha256: input.sha256,
        provider: input.provider ?? "ai",
        matchRef: input.matchRef ?? null,
        uploaderId: input.uploaderId,
      }),
    }));
    if (res.ok) {
      await admin
        .from("safety_incidents")
        .update({ status: "reported", reported_at: new Date().toISOString() })
        .eq("id", incidentId);
      return;
    }
  } catch {
    /* fall through */
  }
  console.error("[safety] NCMEC auto-report failed; manual report REQUIRED for incident:", incidentId);
}

/** KFU-007: returns what actually happened. This used to return void with every
 *  failure swallowed by a bare catch, so the caller deleted the original whether
 *  or not a copy survived — the one outcome that cannot be undone. Both Storage
 *  and PostgREST report failure in a RESOLVED result object rather than by
 *  throwing, so both are checked explicitly here. */
export async function escalateCSAE(input: EscalationInput): Promise<EscalationResult> {
  const admin = createAdminClient();
  const errors: string[] = [];
  const ext = (input.mediaType.split("/")[1] ?? "bin").replace("jpeg", "jpg");
  const storagePath = `incidents/${input.uploaderId}/${input.sha256}.${ext}`;

  // 1) Quarantine the bytes in the PRIVATE bucket for legally-required preservation.
  let preserved = false;
  try {
    const { error: upErr } = await admin.storage.from("quarantine").upload(storagePath, input.bytes, {
      contentType: input.mediaType,
      upsert: true,
    });
    if (upErr) {
      errors.push(`quarantine upload failed: ${upErr.message}`);
    } else {
      preserved = true;
    }
  } catch (e) {
    errors.push(`quarantine upload threw: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!preserved) console.error("[safety] PRESERVATION FAILED — original must be retained:", storagePath);

  // 2) Record a locked incident (service-role only table).
  let incidentId: string | null = null;
  try {
    const preservedUntil = new Date(Date.now() + PRESERVE_DAYS * 86_400_000).toISOString();
    const { data, error: insErr } = await admin
      .from("safety_incidents")
      .insert({
        kind: input.kind,
        status: "preserved",
        uploader_id: input.uploaderId,
        storage_path: storagePath,
        sha256: input.sha256,
        provider: input.provider ?? "ai",
        match_ref: input.matchRef ?? null,
        ai_labels: input.aiLabels ?? null,
        preserved_until: preservedUntil,
      })
      .select("id")
      .single();
    if (insErr) errors.push(`incident insert failed: ${insErr.message}`);
    incidentId = data?.id ?? null;
  } catch (e) {
    errors.push(`incident insert threw: ${e instanceof Error ? e.message : String(e)}`);
  }
  if (!incidentId) console.error("[safety] INCIDENT RECORD FAILED — original must be retained:", storagePath);

  // 3) Alert the safety contact and fire the reporting hook. A failed alert is
  //    serious but it is NOT preservation, and must not be conflated with it.
  let alerted = false;
  try {
    await alertSafetyContact(incidentId, input);
    alerted = true;
  } catch (e) {
    errors.push(`safety alert failed: ${e instanceof Error ? e.message : String(e)}`);
  }
  await reportToNCMEC(admin, incidentId, input);

  return { preserved, incidentId, alerted, errors };
}
