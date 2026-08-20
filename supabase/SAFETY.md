# Klimr — Trust & Safety: child-safety handling for user media

This document is a **launch prerequisite**, not optional polish. Klimr is an all-ages
app, and the social feed accepts user-uploaded images. Hosting user media carries
legal obligations around child sexual abuse material (CSAM). Read this before
enabling photo uploads for the public.

> **The hard truth:** the code in this repo is the *application-layer pipeline*. It
> does not, by itself, make the platform compliant. Real protection requires a
> detection vendor (or Cloudflare's tool), registration with NCMEC, and legal
> counsel. Treat the AI classifier and the hash-match hook as two strong first
> lines of defense — not the whole story.

---

## The two layers we run

1. **AI classification** (`lib/moderation.ts`) — every post/comment/image is
   classified server-side before publish. Fail-closed: unsure/error/unconfigured →
   not published. Catches *novel* material a hash list can't.
2. **Known-CSAM hash matching** (`lib/csam-scan.ts`) — every image is matched
   against a known-CSAM database *before* it is stored or shown. Fail-closed: no
   provider configured → uploads blocked. Catches *known* material with high
   precision.

On a hash hit, or an AI `csae` flag, `lib/safety-escalation.ts`:
- quarantines the bytes in a **private** bucket (`quarantine`, never servable),
- writes a locked incident row (`safety_incidents`, service-role only),
- sets a 90-day preservation window,
- alerts the safety contact, and
- fires the NCMEC reporting hook.

The uploader only ever sees a generic "This image can't be uploaded" — we never
reveal detection details.

---

## Your legal obligations (US)

- **Report apparent CSAM to the NCMEC CyberTipline.** Under **18 U.S.C. § 2258A**,
  electronic service providers must report. **Knowing of CSAM and failing to report
  it is a federal crime.**
- **Preserve** reported material for **90 days** (§ 2258A(h)) in a secure,
  access-controlled way. The `quarantine` bucket + `safety_incidents` scaffold this.
- **Do not proliferate or casually view it.** No forwarding, no copying outside
  quarantine, no "let me just check the image" by untrained staff. Human review, if
  any, must be by trained personnel under counsel.
- This is **US-centric**. If you operate elsewhere, get local advice (e.g. UK IWF,
  EU CSAM regulation).

**Engage legal counsel before launch.** None of the above is legal advice.

---

## What you must set up before public launch

1. **Register as an ESP with NCMEC** and get CyberTipline reporting access:
   https://report.cybertip.org/ (ESP registration).
2. **Pick a matching provider** to back the hash-match webhook:
   - **Thorn Safer** — purpose-built CSAM detection for platforms (hash matching +
     classifiers + reporting assist). Best fit for a startup. https://get.safer.io/
   - **Cloudflare CSAM Scanning Tool** — you already run klimr.com on Cloudflare;
     this scans images at the edge using NCMEC and other hash sets. Enable it in the
     Cloudflare dashboard (Caching/Scrape Shield → CSAM scanning) and complete the
     NCMEC linkage it prompts for.
   - **NCMEC hash sets** — once an approved ESP, you can match against their hashes
     directly (self-hosted matcher using PDQ/MD5/SHA1 sets).
3. **Stand up the webhook** the app calls (see contract below), backed by one of the
   above, and configure the env vars.
4. **Designate a safety contact** and an alerting channel.

---

## Environment variables

| Var | Purpose |
| --- | --- |
| `ANTHROPIC_API_KEY` | AI classifier (also `MODERATION_MODEL`, default `claude-sonnet-4-6`). |
| `CSAM_SCAN_PROVIDER` | `webhook` in prod; unset/`none` blocks uploads (fail-closed). |
| `CSAM_SCAN_WEBHOOK_URL` | Your matching endpoint (Safer/Cloudflare/NCMEC-backed). |
| `CSAM_SCAN_WEBHOOK_TOKEN` | Bearer token sent to that endpoint (optional). |
| `SAFETY_ALERT_WEBHOOK` | POST target for incident alerts (Slack/PagerDuty/email relay). |
| `NCMEC_REPORT_WEBHOOK` | Endpoint that performs the CyberTipline submission. |
| `NCMEC_REPORT_TOKEN` | Bearer token for the reporting endpoint (optional). |
| `SUPABASE_SERVICE_ROLE_KEY` | Required — privileged publish + quarantine + incidents. |
| `SAFETY_DEV_BYPASS` | `true` disables hash matching for **local dev only**. Never in prod. |

If `CSAM_SCAN_PROVIDER` is unset and `SAFETY_DEV_BYPASS` is not `true`, **all image
uploads are blocked**. That's intentional: never host public UGC media without
scanning.

---

## The hash-match webhook contract

`POST {CSAM_SCAN_WEBHOOK_URL}` (with optional `Authorization: Bearer …`)

Request:
```json
{ "sha256": "<hex>", "mediaType": "image/jpeg", "dataBase64": "<base64 bytes>" }
```
Response:
```json
{ "match": false, "matchId": "optional-opaque-ref" }
```
`match: true` triggers quarantine + incident + reporting. Back this endpoint with
Safer, a Cloudflare Worker, or your NCMEC-hash matcher. Prefer sending a perceptual
hash you compute at the edge over raw bytes where the provider supports it.

---

## Migrations

Run in order in the Supabase SQL editor:
- `0006_social_feed.sql` — posts/media/likes/comments, AI-moderation gate, `post-media` bucket.
- `0007_safety.sql` — `safety_incidents` (service-role-only) + private `quarantine` bucket.

## Video

**Off, and off at the boundary** (migration 0195, audit KCDX-006). Two locks, in
the two places that decide: `feed-media` no longer accepts video MIME types, so
Storage refuses the bytes; and `posts_reject_video` refuses the row, for every
role including `service_role`. The composer tab is gone too, but that is the
least of it — a removed tab stops the honest user and nothing else.

### What was wrong

`createPost` ran the image classifier for images only. For a video it attached
the label `media_unscreened` and produced **no verdict**, so the status computed
to `approved`. The label was a note to ourselves, not a gate. Duration came from
a browser `<video>` probe and content type from the upload request, so both facts
about the file were asserted by the client and never checked against the bytes.

### How it comes back

Content screening is **delegated to an external provider** — the same decision
and the same shape as the CSAM hash-matching seam above: a documented webhook
contract, a real vendor behind it, and fail-closed when no provider is
configured. We do not build frame sampling ourselves.

**This is the standing decision for photos too** (owner, Aug 2026). Photos
already run through two delegated screens — the CSAM hash-match seam and the AI
classifier — and both fail closed. Video joins them when the gate is built; the
model does not change, only the media type.

One thing that decision depends on, worth stating where the decision lives:
**a screening vendor is only a control if every byte reaches it.** Until
migration 0199, four buckets carried an own-folder INSERT policy, so a member
could PUT an object with nothing but their own JWT and never touch the server
that calls the screener. Those policies are gone; the server mints a scoped
signed-upload token after its checks. One browser-side path remains
(`tournament-payments`, see 0199) and is named there rather than assumed away.

That covers the screening. It does not cover the rest, and the rest is what
KCDX-006 actually lists:

| Requirement | Provider | Us |
|---|---|---|
| Prohibited-content screening of the video | ✅ | — |
| Byte-level type validation (the file is what it claims) | — | ✅ |
| Duration and codec probed from the file, not the browser | — | ✅ |
| Private staging until a verdict returns | — | ✅ |
| Derivatives (poster frame, transcode) | maybe | ✅ |
| Captions / accessibility | — | ✅ |
| Per-user quotas and orphan cleanup | — | ✅ |
| Hostile-file tests (malformed, bomb, spoofed container) | — | ✅ |

So the re-enable migration is not "point at the vendor and drop the trigger". It
is: the seam, the server-side probing, the staging pipeline, the tests — and
then, as the last two lines, `drop trigger posts_reject_video` and restore the
three MIME types to `feed-media`. Both are deliberate; neither is a dashboard
toggle. `video_disabled_intact()` fails the boot if either happens early.

The `feed_video` feature flag controls the composer only. Its note in the
database says so. A flag that looked like a kill switch but was not would be
worse than no flag.
