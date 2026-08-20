# Media screening at scale — plan (2026-08-12)

**Why now.** Every photo currently lands in manual admin review. That is not a
bug: the pipeline (June 2026, hardened in the Codex batch) fail-closes when its
screeners are unconfigured — `image_review` / `moderation_unconfigured` route
to `pending`. Working as designed, and unshippable at scale. The design goal
below is the Facebook-class shape: **machines clear the overwhelming majority,
humans see only the narrow uncertain band, and illegal-content handling is a
separate, legally-aware lane.**

## Two lanes, never merged

**Lane 1 — known-CSAM hash matching + reporting (legal lane).**
Perceptual-hash match against industry databases, run BEFORE anything else,
with quarantine + evidence preservation + NCMEC reporting. The seams already
exist: `lib/csam-scan.ts` (fail-closed, provider-switchable),
`lib/safety-escalation.ts` (quarantine, locked incident, preservation window,
safety-contact alert, `reportToNCMEC` hook). What is missing is only the
provider:

| Provider | Cost | Notes |
|---|---|---|
| Cloudflare CSAM Scanning Tool | Free on Cloudflare | We already serve through Cloudflare; fuzzy-hash matching with NCMEC-oriented workflow. Fastest path. |
| Microsoft PhotoDNA Cloud | Free, application required | The industry-standard hash set; onboarding takes weeks. Apply in parallel. |
| Thorn Safer | Paid | Strongest tooling incl. classifier for *unknown* CSAM; revisit at scale/funding. |

Per `.claude/rules/privacy-ugc-ai.md`, the CSAM policy (provider, escalation,
evidence access, retention, reporting obligations, appeals) is **owner-approved
— Gabriel's decision**, not inferred by the model.

**Lane 2 — policy classification (product lane).**
Classifier scores per category (sexual, violence, hate, drugs/weapons, spam,
csae-suspect) with thresholds:

- below `T_low` on every category → **auto-approve** (expected: the vast
  majority of racquet-sports photos);
- above `T_high` on any category → **auto-reject** (csae-suspect additionally
  escalates through Lane 1's incident path, never a silent delete);
- between → **manual queue** (the existing admin review UI).

Providers: the switch already exists in `lib/moderation.ts` (Gabriel,
2026-07-21): Anthropic (`ANTHROPIC_API_KEY`, per-token) or
`MODERATION_PROVIDER=openai` (omni-moderation-latest — free, text+images).
Dedicated CV alternatives if volume/cost ever argue for them: AWS Rekognition
(~$1/1k images), Hive, Sightengine, Azure Content Safety. **Enabling Lane 2 is
env-only today — no code, no redeploy beyond variables.**

## Pipeline (on rails that already exist)

upload (private bucket, signed slot) → `enqueue_job('media_screen')` →
worker claims (`claim_jobs`) → Lane 1 hash check → Lane 2 classify →
verdict written to a new `media_screenings` audit row (provider, model
version, category scores, verdict, latency, object key + content digest) →
publish transition verifies the attestation **bound to that exact object
key + digest + scanner version** (rule: a stale, mismatched, or dead scanner
result cannot publish) → approved posts flow to the feed; pending stays
private + signed (already true today).

Costs at scale: 1M photos/month ≈ $0 (OpenAI omni) to ~$1,000 (Rekognition
class); human review shrinks to the `T_low..T_high` band, typically low
single-digit percent.

## Sequencing (pre-launch)

1. **Now, env-only:** set the classifier provider → clean photos start
   auto-approving; manual queue drains to the uncertain band. Decision needed:
   which provider (recommendation: `MODERATION_PROVIDER=openai` — free —
   unless keeping everything on the Anthropic key is preferred).
2. **Now, parallel:** enable Cloudflare CSAM Scanning Tool (free, we're on
   Cloudflare) and file the PhotoDNA application.
3. **Next build batch:** `media_screenings` audit table + attestation binding
   on the publish transition + `media_screen` job worker (moves screening
   off-request, adds retries/observability).
4. **Post-launch:** appeals path; video frames through the same lanes.

## Decisions needed from Gabriel

- Lane 2 provider (env switch): OpenAI omni (free) vs stay on Anthropic.
- Lane 1: approve enabling Cloudflare's tool + authorize the PhotoDNA
  application (company details required on the form).
- Threshold posture at launch: conservative (wider manual band) vs standard.


## Decisions (Gabriel, 2026-08-13)

Lane 2 classifier: **OpenAI** (`MODERATION_PROVIDER=openai`, `OPENAI_API_KEY`), env
vars in Vercel, effective at next deploy. Lane 1: **Cloudflare CSAM Scanning
Tool enabled now**; PhotoDNA application and NCMEC ESP registration move to the
incorporation checklist — both expect a legal entity, and Klimr is not yet
registered. Thresholds: **conservative** (uncertain band routes to manual
review) while invite-only. Build follow-ups: verify the OpenAI image path end
to end, reword the classifier policy string to the 18+ posture, add the
`media_screenings` audit table + publish attestation.

## Video (posts are OFF today by design — KCDX-006)

Video uploads are blocked by the `posts_reject_video` trigger and the
feed-media MIME allowlist until a real gate exists (`video_disabled_intact`
readiness check pins it). The gate, when built, runs on the same jobs rails
with an Instagram-class latency budget for short clips:

1. Upload finalizes into the private bucket → `enqueue_job('media_screen')`.
2. Worker extracts sampled frames (1 fps, capped ~20 frames, plus first/last)
   and runs each through the SAME Lane 2 classifier — with OpenAI that is
   free, and 20 parallel frame calls complete in seconds for a <60s clip.
   Any high-confidence hit rejects; csae-suspect escalates through Lane 1's
   incident path; clean frames auto-approve and the post goes live.
3. Audio lane (transcribe + text-moderate) is a later increment.
4. Upgrade path when video volume is real: Hive or Sightengine native video
   moderation (per-frame pricing, fractions of a cent — order of $1-3 per
   1,000 short clips); Thorn Safer for video-capable CSAM hashing at scale.
   The Cloudflare tool covers images only, so video CSAM hashing is a known
   gap until then — documented, owner-accepted for the pre-launch window.

Lifting KCDX-006 ships in the same batch as the working video gate, never
before.
