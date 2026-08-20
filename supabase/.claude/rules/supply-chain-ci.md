---
paths:
  - "package.json"
  - "package-lock.json"
  - ".nvmrc"
  - ".node-version"
  - ".github/**"
  - "Dockerfile*"
  - "vercel.json"
  - "netlify.toml"
  - "fly.toml"
  - "render.yaml"
  - "*.config.*"
  - ".env*"
  - "scripts/**"
  - "supabase/config.toml"
---

# Supply-chain, CI, configuration, and release rules

## Dependencies

- Commit the lockfile and use `npm ci`. Resolve one maintained Node 22 patch consistently across `package.json`, `.nvmrc`/`.node-version`, CI, and the deployment builder, with automated reviewed upgrades. Until it is pinned consistently, record the actual `process.version` and do not claim exact runtime reproducibility.
- A new dependency requires: necessity, rejected existing/platform alternatives, publisher/repository identity, maintenance activity, security history, transitive footprint, license, permissions/data flow, bundle/runtime impact, and removal plan.
- Pin third-party CI actions and container images to immutable commit/digest identifiers. Automate reviewed updates.
- Do not run install scripts from an unreviewed package with secrets or write credentials present.
- Remove unused dependencies and keep runtime dependencies separate from development tooling.
- Scan direct and transitive dependencies continuously and after every lockfile/base-image change. Include malicious-package and license policy checks.
- Generate a CycloneDX or SPDX SBOM for every release and retain it with artifact metadata.
- A release contains no applicable CISA Known Exploited Vulnerability and no known exploitable critical/high production vulnerability. Exceptions need reachability evidence, compensating controls, owner, approval, expiry, and VEX-style rationale.

## Secrets and configuration

- Secrets never enter source, git history, fixtures, client bundles, build output, logs, screenshots, analytics, or `NEXT_PUBLIC_*` variables.
- Use separate least-privilege identities and secrets per environment and service. Prefer short-lived workload identity where supported.
- Validate required configuration at startup with a typed schema. Do not silently use insecure placeholder/default values.
- A missing auth, CAPTCHA, MFA, scanner, payment, cron, schema, or privacy safety configuration fails closed or keeps the affected feature disabled.
- Document secret owner, purpose, scope, consumers, rotation, revocation, and incident response. A suspected leak is revoked/rotated immediately; deletion from the current file is not remediation.
- Never echo environment values in CI diagnostics. Redact structured error/log fields.

## CI and repository protection

- Protect production/release branches: no direct or force pushes, no deletion, required up-to-date checks, stale approval dismissal, and non-author human approval.
- CODEOWNERS or equivalent qualified review is required for auth, RLS/grants/migrations, service role, payments, privacy/location, UGC/moderation, secrets/crypto, CI/release, and reliability invariants.
- CI permissions default read-only and elevate only per job. Untrusted pull requests do not receive secrets, write tokens, privileged runners, or unsafe checkout/execution paths.
- Required checks cannot be bypassed by Claude. An emergency override is a named human action, audited, time-bounded, and followed by verification/postmortem.
- Required gates include clean install, formatting, lint ratchet, strict typecheck, unit/integration tests, relevant real-Postgres security/concurrency tests, production build, preview E2E, SAST, secret scan, dependency/SCA/license policy, SBOM, and migration/security catalog assertions.
- Store test/provenance artifacts, coverage/security reports, migration plan, and immutable build digest for each release.

## Build and provenance

- Choose and document the authoritative production builder. Do not deploy a workstation artifact.
- If Vercel is the builder, use a staged production deployment, run required Deployment Checks against it, and promote that exact deployment unchanged; a GitHub CI build that Vercel later rebuilds is not the served artifact and does not prove artifact identity. Alternatively, deploy a genuinely attested CI-built artifact without rebuilding.
- Build once in the authoritative builder and promote the exact immutable artifact/deployment identity through the supported release path.
- Target SLSA Build Level 2 immediately with signed provenance; target Build Level 3 before large-scale public launch. The claim applies only when provenance covers the artifact actually served. Until then, keep it in the owned control register as a release/public-GO adoption item. Verify builder identity, source revision, parameters, inputs, signature, and artifact digest before deployment.
- Keep build output reproducible as practical. Network downloads during build must be pinned and verified.
- Do not expose server source maps or internal artifacts publicly unless deliberately protected.

## Deployment safety

- Use isolated local, preview/staging, and production projects/accounts/credentials. No production data in lower environments without approved de-identification.
- Deploy only after required checks and human approval. Verify application build, database ledger, configuration version, and feature-flag state.
- Risky releases use canary/staged expansion with explicit SLO/business-integrity thresholds, observation periods, halt authority, and tested rollback/forward repair.
- Database migrations follow compatible rollout order and have lock/time/data/backfill/recovery evidence.
- No release is "GO" merely because CI is green; production readiness requires the checklist in `docs/engineering/ENFORCEMENT_CHECKLIST.md`.

## Vulnerability handling

- Maintain `SECURITY.md`, a private reporting path, on-call ownership, triage procedure, and tested containment/rollback.
- Active exploitation, credential compromise, cross-account privileged access, payment fraud, or public sensitive-data disclosure is contained immediately and blocks release.
- Use internally approved remediation SLAs. Never treat CISA's outer KEV timing as permission to leave an exploitable issue exposed.
- For every high-impact defect, identify root cause, search for variants, add a regression and prevention control, and track data repair/notification obligations.

## Digest pins, SBOM, and the release manifest (KFU-025/034, 2026-08-20)
- Every workflow `uses:` is pinned to a full commit SHA with a `# vN` comment.
  Resolve tags with `git ls-remote https://github.com/<owner>/<repo> refs/tags/<tag> 'refs/tags/<tag>^{}'`
  (annotated tags: take the peeled `^{}` line). Never recall a SHA from memory.
- CI produces a CycloneDX SBOM (`npm sbom --sbom-format cyclonedx --omit dev`)
  as a build artifact.
- Before every zip: `node scripts/release-manifest.mjs`; record its top-hash in
  the batch's DESIGN_DECISIONS entry. The manifest binds artifact ↔ digests.
