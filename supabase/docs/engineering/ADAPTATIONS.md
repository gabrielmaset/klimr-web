# Adaptations to the source engineering package

The Klimr Enterprise Engineering Rules package (ChatGPT Codex, Aug 2026) is adopted as
Klimr's normative engineering baseline. The ten scoped rules under `.claude/rules/` and the
eight templates under `docs/engineering/` are installed **verbatim**.

Four adaptations were made, all owner-approved. Each records what changed and why, so a
future reader can tell an adaptation from a drift.

---

## ADAPTATION 1 — Review under a solo owner

**Source rule:** R2/R3 changes require a non-author qualified specialty approver.

**Problem:** Klimr has one non-technical owner and an AI engineer who is also the author of
every change. The rule as written cannot be satisfied, and a rule that cannot be satisfied
is either ignored or falsely claimed. Both are worse than naming the gap.

**Adaptation:** Claude is the author and MUST NOT be recorded as the approver. R2/R3
instead requires four compensating controls, with the owner signing off on the decision and
residual risk rather than the code:

1. a negative control — the protection is proven to fail when removed;
2. adversarial self-review, written, naming the load-bearing assumption and the untested path;
3. an independent model audit for security-relevant surfaces, findings dispositioned individually;
4. owner sign-off on residual risk via the completion template.

**Honest status:** weaker than a qualified human reviewer. Recorded as a
`PUBLIC-GO BLOCKER` in the control register so it cannot quietly become permanent.

---

## ADAPTATION 2 — Silent failure and canaries promoted to a scoped rule

**Source rule:** silent-stoppage detection appears as a few lines under observability.

**Problem:** every one of the ten most serious defects found during the August 2026
remediation was a silent stoppage — nothing threw, no test failed, no monitor fired. The
source package is excellent at proving code correct and thin on detecting work that stops
happening. Those are different failure modes and need different controls.

**Adaptation:** added `.claude/rules/silent-failure-canaries.md` as a first-class scoped
rule, with the six real precedents, and a matching section in `CLAUDE.md`. Requires a
canary measuring **absence** for any scheduled job, delivery path, or reconciliation, plus
proof the canary detects the failure.

---

## ADAPTATION 3 — Lint ratchet enforced now, not deferred to zero

**Source rule:** "Ratchet the current backlog to zero, then enforce `--max-warnings 0`."

**Problem:** that leaves the gate switched off during the entire period the codebase is
dirtiest and most likely to accumulate more. The measured baseline is 137 warnings, 0 errors.

**Adaptation:** `npm run lint` enforces `--max-warnings <baseline>` **today**. No new
warning can enter. The number is lowered as debt is cleaned and MUST NOT be raised;
`tests/guardrails.test.ts` asserts the script's ceiling matches the recorded baseline, so
raising it silently fails the build. The end state is identical; the gate is live months
earlier.

---

## ADAPTATION 4 — Completion template proportional to risk

**Source rule:** the paste instruction directs the full template at "every later
implementation handoff."

**Problem:** fourteen fields on a documentation typo gets skipped, and a template that gets
skipped teaches that templates are optional — which then costs you the one time it mattered.

**Adaptation:** `AGENT_COMPLETION_TEMPLATE_SHORT.md` is the default for R0/R1;
`AGENT_COMPLETION_TEMPLATE.md` is required for R2/R3 and releases. This matches what the
package's own `CLAUDE.md` says; the adaptation is only against the paste instruction.

---

## Sequencing note

The package's install instruction ordered installation (step 4) before the conflict/gap
report (step 3) and adoption plan (step 5). That order commits a contract the repository
has not yet been reconciled against, so the repo asserts rules it fails from the first
commit. The report was produced first and the owner approved installation afterwards.
