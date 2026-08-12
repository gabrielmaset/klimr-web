import "server-only";
import { createHash } from "node:crypto";
import { scanForKnownCSAM } from "@/lib/csam-scan";
import { escalateCSAE } from "@/lib/safety-escalation";
import { getPrivilegedClient } from "@/lib/privileged";
import { moderateImage } from "@/lib/moderation";

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
    await escalateCSAE({
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
    await admin.storage.from(input.bucket).remove([input.path]);
    return { outcome: "match", sha256, incidentRef: scan.matchId ?? sha256 };
  }

  if (scan.blocked) {
    // The scan could not reach a verdict. Hold, do not publish, do not destroy.
    return { outcome: "undecided", sha256, reason: scan.reason ?? "Safety scan unavailable." };
  }

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
}): Promise<{ verdicts: Verdict[]; labels: string[]; mediaRemoved: boolean }> {
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

  return { verdicts: [verdict], labels: [], mediaRemoved: false };
}
