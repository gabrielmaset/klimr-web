# OWASP ASVS 5.0.0 evidence matrix template

Use the official ASVS 5.0.0 requirement catalog as the source of truth. Do not rewrite a requirement into an easier local interpretation. Keep one row per applicable requirement and pin evidence to the exact application build, database ledger, configuration, environment, and test identity.

Maintain one living application-level matrix. Each security-sensitive change records only its applicability/evidence delta and links the affected rows; each release reviews the complete matrix. Do not generate a disconnected full copy for every change.

Klimr baseline:

- Level 2 application-wide.
- Relevant Level 3 requirements for administrator/operator/support/moderation, recovery, payments/value, precise location, private identity, evidence/bulk export, cryptographic, destructive, and release infrastructure surfaces.

| ASVS ID/version | Level | Requirement summary/link | Applicable? and rationale | Klimr surfaces/data | Implementation controls | Automated test and negative cases | Manual/runtime evidence | Evidence level/build/schema/date | Owner | Gap/exception/expiry |
|---|---:|---|---|---|---|---|---|---|---|---|
| | | | | | | | | | | |

## Evidence rules

- `Not applicable` requires a concrete architecture/data-flow reason and human security approval.
- A source code pointer is Static evidence, not runtime verification.
- A test name without command/result/artifact is not evidence.
- Service-role/owner tests do not prove low-privilege authorization or RLS.
- One happy path does not satisfy requirements that imply negative, boundary, replay, concurrency, or failure cases.
- Reassess applicability when routes/actions/RPCs, data classification, auth/provider, deployment, dependencies, or threat model changes.
- Expired exceptions reopen the requirement automatically.
