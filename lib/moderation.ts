import "server-only";

/**
 * AI content-safety gate for the social feed. Runs server-side before any post or
 * comment is published. Image moderation is FAIL-CLOSED: if the classifier is
 * unconfigured, errors, or is unsure, imagery is NOT allowed through. Text moderation
 * fails OPEN only when the classifier is entirely unconfigured (dev/pre-launch), since
 * text is lower-risk and the feed should be usable; once configured it screens all text.
 * This is the application-layer defense; production media hosting also needs known-CSAM
 * hash matching + legal reporting.
 *
 * Provider is Anthropic by default; set ANTHROPIC_API_KEY (and optionally
 * MODERATION_MODEL) in the environment. The call happens on the server, so it is
 * not subject to the browser CSP.
 */

export type Verdict = { allowed: boolean; categories: string[]; reason?: string };

const KEY = process.env.ANTHROPIC_API_KEY;
const MODEL = process.env.MODERATION_MODEL ?? "claude-sonnet-4-6";

/** The single most important label: child sexual abuse / exploitation material. */
export const CSAE = "csae";

const POLICY =
  "Prohibited content and the exact category to use for each: " +
  "csae = ANY sexual, suggestive, nude, or exploitative depiction of a minor (this is the highest priority — never allow); " +
  "sexual = adult nudity or sexual content; " +
  "violence = graphic violence, gore, or self-harm; " +
  "hate = hateful symbols, slurs, or targeted harassment; " +
  "drugs_weapons = sale of weapons or illegal drugs; " +
  "spam = spam, scams, phishing, or doxxing; " +
  "other = anything else clearly inappropriate for an all-ages app.";

type Block = { type: string; text?: string };
type AnthropicResponse = { content?: Block[] };
type ContentPart =
  | { type: "text"; text: string }
  | { type: "image"; source: { type: "base64"; media_type: string; data: string } };

async function classify(parts: ContentPart[]): Promise<Verdict> {
  if (!KEY) {
    return { allowed: false, categories: ["moderation_unconfigured"], reason: "Content safety isn't configured yet." };
  }
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-api-key": KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: 200,
        system:
          "You are a strict content-safety classifier for Klimr, a sports social app used by people of all ages. " +
          POLICY +
          ' Respond with ONLY minified JSON and no other text: {"allowed":boolean,"categories":string[],"reason":string}. ' +
          "Each category MUST be exactly one of: csae, sexual, violence, hate, drugs_weapons, spam, other. " +
          "Set allowed to false if any category applies, and if the content is borderline or you are unsure.",
        messages: [{ role: "user", content: parts }],
      }),
    });
    if (!res.ok) {
      return { allowed: false, categories: ["moderation_error"], reason: `Safety check failed (${res.status}).` };
    }
    const data = (await res.json()) as AnthropicResponse;
    const text = (data.content ?? [])
      .filter((b) => b.type === "text")
      .map((b) => b.text ?? "")
      .join("");
    const parsed = JSON.parse(text.replace(/```json|```/g, "").trim()) as {
      allowed?: unknown;
      categories?: unknown;
      reason?: unknown;
    };
    return {
      allowed: parsed.allowed === true,
      categories: Array.isArray(parsed.categories) ? parsed.categories.map(String) : [],
      reason: typeof parsed.reason === "string" ? parsed.reason : undefined,
    };
  } catch {
    return { allowed: false, categories: ["moderation_error"], reason: "Could not verify content safety." };
  }
}

export async function moderateText(text: string): Promise<Verdict> {
  const t = text.trim();
  if (!t) return { allowed: true, categories: [] };
  // Text is far lower-risk than imagery. When the classifier isn't configured yet
  // (e.g. local/dev before ANTHROPIC_API_KEY is set), let text through so the feed
  // is usable, backed by user reporting + admin review. Once the key is set, every
  // post and comment is AI-screened. Image moderation below stays fail-closed.
  if (!KEY) {
    console.warn("[moderation] ANTHROPIC_API_KEY not set — text published without AI screening.");
    return { allowed: true, categories: [] };
  }
  return classify([{ type: "text", text: `User-submitted text to classify:\n"""${t}"""` }]);
}

export async function moderateImage(base64: string, mediaType: string): Promise<Verdict> {
  return classify([
    { type: "text", text: "Classify this user-uploaded image against the policy." },
    { type: "image", source: { type: "base64", media_type: mediaType, data: base64 } },
  ]);
}

/** True if the verdict flags child sexual abuse / exploitation — the escalation trigger. */
export function containsCSAE(v: Verdict): boolean {
  return v.categories.map((c) => c.toLowerCase()).includes(CSAE);
}
