/** Pure step-up decision (audit SEC-006 · D8 · K1-02).
 *
 *  Every Klimr account enrolls TOTP at first login ("2FA is required on every
 *  Klimr account"), so a healthy session is AAL2. The D8 mutation list must
 *  ASSERT that server-side and fail closed:
 *   · "challenge"        — factor enrolled but session is AAL1 → re-verify at /mfa
 *   · "enroll_required"  — no verified factor (shouldn't happen; deny anyway)
 *   · "ok"               — session already AAL2 */
export type StepUpDecision = "ok" | "challenge" | "enroll_required";

export function stepUpDecision(
  currentLevel: string | null | undefined,
  nextLevel: string | null | undefined,
): StepUpDecision {
  if (nextLevel === "aal2") return currentLevel === "aal2" ? "ok" : "challenge";
  // nextLevel aal1 (or unknown): no verified factor exists on the account.
  return "enroll_required";
}
