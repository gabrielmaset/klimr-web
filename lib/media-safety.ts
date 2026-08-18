import "server-only";
import { createHash } from "node:crypto";
import { scanForKnownCSAM } from "@/lib/csam-scan";
import { escalateCSAE } from "@/lib/safety-escalation";
import { getPrivilegedClient } from "@/lib/privileged";
import { moderateImage, moderationScanner, MODERATION_POLICY_VERSION } from "@/lib/moderation";
import { mayDestroyOriginal, preservationHoldReason, requiresCsaeEscalation } from "@/lib/safety-rules";

/** KRA-005 — the one gate every stored byte passes through before it can publish.
 *
 *  The re-audit found `scanForKnownCSAM` and `escalateCSAE` fully implemented and
 *  called from NOWHERE. A whole-tree search returned their own definitions and
 *  nothing else. The Feed downloaded a photo and ran AI moderation on it; avatars
 *  and marketplace listings issued signed upload URLs on a caller-DECLARED MIME
 *  with no byte inspection at all. So the known-content gate this project
 *  designed, documented in SAFETY.md and reasoned about in three migrations had
 *  never executed once.
 *
 *  Why it was probably never wired, and what that forced:
 *  `scanForKnownCSAM` is fail-closed — with `CSAM_SCAN_PROVIDER=none` it returns
 *  `blocked: true`. Calling it naively would refuse every photo upload on a
 *  pre-launch project with no provider configured, so the honest options were to
 *  wire it and break uploads, or leave it dead. It was left dead.
 *
 *  The resolution here separates two things that were being conflated:
 *    · a known MATCH ⇒ the object is quarantined, an incident is recorded, the
 *      escalation runs, and the content never publishes. No degradation, ever.
 *    · a scan that could not RUN (unconfigured, vendor down, timeout) ⇒ the
 *      content does not publish either, but it is held for review rather than
 *      destroyed. `pending` is not visible to anyone but the author, so nothing
 *      reaches another member without a successful decision — which is the
 *      acceptance criterion — while an outage does not silently delete a
 *      member's upload.
 *
 *  Fail-closed therefore means "never publishes", not "always rejects". Those are
 *  different failures and only one of them is a safety property. */

export type MediaVerdict =
  | { outcome: "clean"; sha256: string; bytes: number }
  | { outcome: "match"; sha256: string; incidentRef: string }
  | { outcome: "undecided"; sha256: string | null; reason: string };

const MAX_SCAN_BYTES = 12_000_000;

/** The whole publish decision for a post: what the verdicts imply, and whether
 *  current screening evidence exists for the stored bytes (KFU-008).
 *
 *  This lives here rather than in the Feed action because KCDX-067 budgets that
 *  module's size precisely so safety concerns are not re-absorbed into it — and
 *  when adding the evidence gate pushed the action over its budget, the budget
 *  was the thing that was right. */
export async function decidePostModeration(input: {
  verdicts: Verdict[];
  extraLabels: string[];
  gateDownCategories: ReadonlySet<string>;
  /** The stored object to check evidence for, or null for a text post. */
  media: { bucket: string; path: string; sha256: string | null | undefined } | null;
}): Promise<{ status: "approved" | "pending" | "rejected"; labels: string[] }> {
  const labels = [...new Set([...input.verdicts.flatMap((v) => v.categories), ...input.extraLabels])];
  const flagged = input.verdicts.some(
    (v) => !v.allowed && v.categories.some((c) => !input.gateDownCategories.has(c)),
  );
  const gateDown = !flagged && input.verdicts.some((v) => !v.allowed);
  let status: "approved" | "pending" | "rejected" = flagged ? "rejected" : gateDown ? "pending" : "approved";

  // KFU-008: publication additionally requires CURRENT evidence for the exact
  // bytes. Fail-closed — a check that cannot run holds the post for review.
  if (status === "approved" && input.media) {
    const gate = await evidenceAllowsPublish(input.media);
    if (!gate.ok) {
      console.error("[safety] publish held —", gate.reason);
      labels.push("media_unscreened");
      status = "pending";
    }
  }
  return { status, labels };
}

/** KFU-008 publish gate. Asks the ledger whether CURRENT evidence exists for
 *  exactly these bytes (migration 0286: clean verdict, real scanner, within the
 *  freshness bound). Fail-closed — a check that cannot run holds the content.
 *
 *  Lives here rather than in the Feed action for the reason KCDX-067 records:
 *  media safety is a concern with its own subject, and the action module has a
 *  size budget that exists to keep it from re-absorbing concerns like this one. */
export async function evidenceAllowsPublish(input: {
  bucket: string;
  path: string;
  sha256: string | null | undefined;
}): Promise<{ ok: boolean; reason?: string }> {
  if (!input.sha256) return { ok: false, reason: "no digest for the stored object" };
  try {
    const admin = getPrivilegedClient({ reason: "media-safety:publish-gate" });
    const { data, error } = await admin.rpc("media_evidence_current", {
      p_bucket: input.bucket,
      p_path: input.path,
      p_sha256: input.sha256,
    });
    if (error) return { ok: false, reason: error.message };
    return data === true ? { ok: true } : { ok: false, reason: "no current screening evidence for these bytes" };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.message : String(e) };
  }
}

/** KFU-008: write the evidence. A verdict computed in memory and discarded
 *  cannot be tied to the bytes it was made about, so a reviewed decision has
 *  nothing to stand on and a replaced object inherits nothing to detect. The row
 *  is keyed by digest in 0286, so this is idempotent per (object, bytes) — a
 *  duplicate is a unique-violation we deliberately swallow rather than an error
 *  worth failing an upload over. */
async function recordScreening(input: {
  bucket: string; path: string; sha256: string;
  verdict: "clean" | "match" | "undecided" | "csae_escalated";
  labels?: string[];
}): Promise<void> {
  try {
    const scanner = moderationScanner();
    const admin = getPrivilegedClient({ reason: "media-safety:record-evidence" });
    const { error } = await admin.from("media_screenings").insert({
      bucket_id: input.bucket,
      object_path: input.path,
      sha256: input.sha256,
      scanner_provider: scanner.provider,
      scanner_version: scanner.version,
      policy_version: MODERATION_POLICY_VERSION,
      verdict: input.verdict,
      labels: input.labels?.length ? input.labels : null,
    });
    // 23505 = the same bytes screened twice for the same object: already recorded.
    if (error && error.code !== "23505") {
      console.error("[safety] screening evidence NOT recorded", error.code, error.message);
    }
  } catch (e) {
    console.error("[safety] screening evidence threw", e instanceof Error ? e.message : String(e));
  }
}

/** Magic-number sniffing. The declared content type arrives from the client and
 *  is worth exactly what the client is worth; a polyglot file that claims
 *  image/jpeg is the ordinary shape of this attack. */
function sniffImage(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return "image/jpeg";
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47) return "image/png";
  if (buf[0] === 0x47 && buf[1] === 0x49 && buf[2] === 0x46) return "image/gif";
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return "image/webp";
  return null;
}

/** Screens an object already in Storage and returns what may happen to it.
 *
 *  The caller MUST NOT publish on anything but `clean`. `undecided` means hold
 *  (pending review); `match` means the object has been moved to quarantine and an
 *  incident raised, and the caller should remove its reference. */
export async function screenStoredObject(input: {
  bucket: string;
  path: string;
  uploaderId: string;
  declaredType?: string | null;
}): Promise<MediaVerdict> {
  const admin = getPrivilegedClient({ reason: "media-safety:screen" });

  const { data: file, error } = await admin.storage.from(input.bucket).download(input.path);
  if (!file || error) {
    return { outcome: "undecided", sha256: null, reason: "Could not read the upload." };
  }

  const buf = Buffer.from(await file.arrayBuffer());
  if (buf.byteLength === 0 || buf.byteLength > MAX_SCAN_BYTES) {
    return { outcome: "undecided", sha256: null, reason: "Upload outside the screenable size." };
  }

  const sha256 = createHash("sha256").update(buf).digest("hex");

  // Bytes decide the type, not the request. A mismatch is not necessarily an
  // attack — but it is never something to publish on a declared value.
  const sniffed = sniffImage(buf);
  if (!sniffed) {
    return { outcome: "undecided", sha256, reason: "Unrecognised image format." };
  }

  const scan = await scanForKnownCSAM(buf, sha256, sniffed);

  if (scan.match) {
    // `escalateCSAE` already owns quarantine, the preserved incident row, the
    // safety-contact alert and the reporting hook (0007 / SAFETY.md). My first
    // draft of this seam reimplemented the first two of those inline, which is
    // exactly the duplication that produced five inline copies of the block
    // predicate elsewhere in this schema. Call the thing that exists.
    const escalation = await escalateCSAE({
      uploaderId: input.uploaderId,
      bytes: buf,
      sha256,
      mediaType: sniffed,
      kind: "csam_hash_match",
      provider: scan.provider,
      matchRef: scan.matchId,
    });

    // The servable copy goes, now that the preserved copy exists. Order matters:
    // removing first would risk losing the evidence if escalation failed.
    // KFU-007: the original is destroyed ONLY when a durable copy and a durable
    // incident row both exist. Previously this removed the object regardless of
    // whether the quarantine upload had succeeded — destroying the evidence the
    // escalation exists to preserve.
    if (mayDestroyOriginal(escalation)) {
      const { error: rmErr } = await admin.storage.from(input.bucket).remove([input.path]);
      if (rmErr) console.error("[safety] original removal failed after preservation:", rmErr.message);
    } else {
      console.error(
        "[safety] ORIGINAL RETAINED —", preservationHoldReason(escalation),
        "| path:", input.path, "| errors:", escalation.errors.join("; "),
      );
    }
    await recordScreening({ bucket: input.bucket, path: input.path, sha256, verdict: "match" });
    return { outcome: "match", sha256, incidentRef: scan.matchId ?? sha256 };
  }

  if (scan.blocked) {
    // The scan could not reach a verdict. Hold, do not publish, do not destroy.
    await recordScreening({ bucket: input.bucket, path: input.path, sha256, verdict: "undecided" });
    return { outcome: "undecided", sha256, reason: scan.reason ?? "Safety scan unavailable." };
  }

  await recordScreening({ bucket: input.bucket, path: input.path, sha256, verdict: "clean" });
  return { outcome: "clean", sha256, bytes: buf.byteLength };
}

type Verdict = { allowed: boolean; categories: string[]; reason?: string };

/** The Feed photo decision, in one place: screen the bytes for known content
 *  first, then classify — never the other way round, because a classifier verdict
 *  cannot make an already-published object unpublished.
 *
 *  Returns verdicts for the caller to fold into its status computation. The
 *  caller's GATE_DOWN set maps `moderation_error` to `pending`, which is what
 *  turns "the scan could not run" into hold-for-review rather than publish. */
export async function screenAndClassifyPhoto(input: {
  bucket: string;
  path: string | null;
  uploaderId: string;
  isPhoto: boolean;
}): Promise<{ verdicts: Verdict[]; labels: string[]; mediaRemoved: boolean; sha256?: string | null }> {
  // "Is there anything to screen" is this module's question, not the caller's.
  if (!input.isPhoto || !input.path) return { verdicts: [], labels: [], mediaRemoved: false };

  const screen = await screenStoredObject({
    bucket: input.bucket,
    path: input.path,
    uploaderId: input.uploaderId,
    declaredType: "image/jpeg",
  });

  if (screen.outcome === "match") {
    // Preserved, escalated and removed from the servable bucket inside the seam.
    return {
      verdicts: [{ allowed: false, categories: ["csam_hash_match"], reason: "Upload refused." }],
      labels: ["csam_hash_match"],
      mediaRemoved: true,
    };
  }

  if (screen.outcome === "undecided") {
    return {
      verdicts: [{ allowed: false, categories: ["moderation_error"], reason: screen.reason }],
      labels: ["media_unscreened"],
      mediaRemoved: false,
    };
  }

  const admin = getPrivilegedClient({ reason: "media-safety:classify" });
  const { data: file } = await admin.storage.from(input.bucket).download(input.path);
  if (!file) {
    return {
      verdicts: [{ allowed: false, categories: ["moderation_error"], reason: "Could not read the upload." }],
      labels: [],
      mediaRemoved: false,
    };
  }
  const buf = Buffer.from(await file.arrayBuffer());
  const verdict: Verdict =
    buf.byteLength <= 4_500_000
      ? await moderateImage(buf.toString("base64"), file.type || "image/jpeg")
      : { allowed: false, categories: ["image_review"], reason: "Large image queued for review." };

  // KFU-029: a classifier verdict naming a minors category is not an ordinary
  // refusal. Refusing drops the bytes and records nothing; this path must
  // PRESERVE and ESCALATE first — `containsCSAE` and the `ai_csae_flag`
  // escalation kind both existed for this and were called from nowhere.
  if (requiresCsaeEscalation(verdict.categories)) {
    const sha256 = createHash("sha256").update(buf).digest("hex");
    const escalation = await escalateCSAE({
      uploaderId: input.uploaderId,
      bytes: buf,
      sha256,
      mediaType: file.type || "image/jpeg",
      kind: "ai_csae_flag",
      provider: "ai",
      aiLabels: verdict.categories ?? [],
    });
    let mediaRemoved = false;
    if (mayDestroyOriginal(escalation)) {
      const { error: rmErr } = await admin.storage.from(input.bucket).remove([input.path]);
      if (rmErr) {
        console.error("[safety] original removal failed after AI escalation:", rmErr.message);
      } else {
        mediaRemoved = true;
      }
    } else {
      console.error(
        "[safety] ORIGINAL RETAINED after AI CSAE flag —", preservationHoldReason(escalation),
        "| path:", input.path, "| errors:", escalation.errors.join("; "),
      );
    }
    // Never publishes either way: the verdict stays disallowed.
    await recordScreening({
      bucket: input.bucket, path: input.path, sha256,
      verdict: "csae_escalated", labels: verdict.categories ?? [],
    });
    return {
      verdicts: [{ allowed: false, categories: verdict.categories ?? ["csae"], reason: "Upload refused." }],
      labels: ["csae_escalated"],
      mediaRemoved,
      sha256,
    };
  }

  return { verdicts: [verdict], labels: [], mediaRemoved: false, sha256: screen.sha256 };
}
