"use server";

import { createClient } from "@/lib/supabase/server";
import { rateLimit } from "@/lib/ratelimit";
import { runAiSearch, type AiSearchResult } from "@/lib/ai-search";

/** AI-enabled global search. SECURITY: retrieval runs on the USER's client —
 *  Row-Level Security decides visibility; the model only orchestrates. */
export async function aiSearch(query: string): Promise<{ ok: boolean; result?: AiSearchResult; error?: string }> {
  const q = String(query ?? "").trim();
  if (q.length < 3) return { ok: false, error: "Type a little more first." };
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Sign in to use AI search." };
  const allowed = await rateLimit(`ai-search:${user.id}`, 12, 60);
  if (!allowed) return { ok: false, error: "A lot of searches at once — give it a few seconds." };
  const { data: profile } = await supabase.from("profiles").select("home_zip").eq("id", user.id).maybeSingle();
  const result = await runAiSearch(supabase, user.id, profile?.home_zip ?? null, q);
  if (!result) return { ok: false, error: "AI search couldn't complete that one — try rephrasing." };
  return { ok: true, result };
}
