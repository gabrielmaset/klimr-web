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

Not enabled. Real video moderation (frame sampling + hash matching such as
TMK+PDQF / CSAI Match) is a separate build. The schema reserves `media_type='video'`
for when it lands; until then the app accepts images only.
