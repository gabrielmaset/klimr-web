# Engineering control register

Complete this before turning the package into required policy. One row represents one independently verifiable control. Never label a control enforced because it appears in `CLAUDE.md`.

Allowed states:

- **ENFORCED NOW:** technically enforced on the protected branch or production boundary and currently passing.
- **RATCHET/ADOPTION:** legacy non-security quality/operational capability with a measured baseline, no-new-debt gate, named owner, target date, and interim control.
- **PUBLIC-GO BLOCKER:** must be implemented and evidenced before public launch/scale expansion; it cannot be waived by recording the current state.

Known audit P0/P1 issues, exposed secrets, auth/privacy/RLS bypasses, schema-integrity failures, applicable KEVs/exploitable high or critical production vulnerabilities, and required acceptance-test failures cannot be normalized as a ratchet baseline.

| Control ID | Rule/source | State | Exact enforcement tool/command/config | Scope/environment | Evidence artifact and last result | Owner/reviewer | Interim control | Target date | Exception/expiry |
|---|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | |

## Minimum register families

- Branch protection, non-author review, CODEOWNERS, MFA, and CI permissions.
- Format/lint/type/unit/integration/build/preview E2E and accessibility.
- Real-role RLS/RPC, migration reset/upgrade/catalog drift, and concurrency.
- SAST, secret scan, dependency/SCA/license/malicious package, KEV, SBOM, and provenance.
- Security headers, API inventory, direct negative tests, sensitive-data egress, UGC, payment, and AI evaluations.
- SLOs, telemetry/alerts/runbooks, load/headroom, dependency/fault, canary/rollback, and restore/RPO/RTO.

## Verification questions

- Does the control fail a deliberately noncompliant fixture/change?
- Can Claude or a pull request author bypass it?
- Does it run on the exact artifact/schema/config that will be served?
- Is a human owner alerted on failure?
- Is the evidence retained and tied to revision/build/schema?
- If adoption is incomplete, is public GO explicitly blocked where required?
