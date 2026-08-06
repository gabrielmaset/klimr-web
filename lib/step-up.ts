import "server-only";
import { createClient } from "@/lib/supabase/server";
import { stepUpDecision, type StepUpDecision } from "@/lib/step-up-rules";

/** Server-side AAL2 assertion for the D8 mutation list (audit SEC-006).
 *  FAIL CLOSED: any error reading assurance levels counts as not satisfied. */
export async function getStepUpDecision(): Promise<StepUpDecision> {
  try {
    const supabase = await createClient();
    const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
    if (error || !data) return "challenge";
    return stepUpDecision(data.currentLevel, data.nextLevel);
  } catch {
    return "challenge";
  }
}
