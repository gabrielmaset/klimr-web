import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";

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
      await fetch(hook, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(summary) });
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
    const res = await fetch(endpoint, {
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
    });
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

export async function escalateCSAE(input: EscalationInput): Promise<void> {
  const admin = createAdminClient();
  const ext = (input.mediaType.split("/")[1] ?? "bin").replace("jpeg", "jpg");
  const storagePath = `incidents/${input.uploaderId}/${input.sha256}.${ext}`;

  // 1) Quarantine the bytes in the PRIVATE bucket for legally-required preservation.
  try {
    await admin.storage.from("quarantine").upload(storagePath, input.bytes, {
      contentType: input.mediaType,
      upsert: true,
    });
  } catch (e) {
    console.error("[safety] quarantine upload failed:", e);
  }

  // 2) Record a locked incident (service-role only table).
  let incidentId: string | null = null;
  try {
    const preservedUntil = new Date(Date.now() + PRESERVE_DAYS * 86_400_000).toISOString();
    const { data } = await admin
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
    incidentId = data?.id ?? null;
  } catch (e) {
    console.error("[safety] incident insert failed:", e);
  }

  // 3) Alert the safety contact and fire the reporting hook.
  await alertSafetyContact(incidentId, input);
  await reportToNCMEC(admin, incidentId, input);
}
