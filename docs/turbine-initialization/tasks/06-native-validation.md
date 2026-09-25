# Task 6: validate native behavior and prepare contribution slices

Require reviewed stage 5 and read [plan](../plan.md),
[contract](../contract.md), [validation](../validation.md), decisions and
stage reports. This task verifies and prepares local contributions; it does
not publish them or request review on GitHub.

## Work

1. Audit the combined implementation against the contract and matrix. Map
   every changed behavior to an actual test and reviewed numerical tolerance.
   Check for app-specific knowledge, hidden compatibility switches, duplicate
   equations, accidental other-engine changes and unsupported restoration
   claims. Fix material findings in their owning stage and rerun affected
   checks before final acceptance.
2. On the exact final integration source, run full discovered native/Python
   tests with Python enabled and CxxTest with it disabled. Verify expected
   turbine tests actually run. Classify baseline-only failures with evidence;
   no broad flake exemption. Reuse unchanged stage evidence only after
   verifying its exact inputs and artifact identities.
3. Compare the current complete shipped-script inventory on common fixture
   bytes against the pre-redesign integration, with isolated output
   directories. Retain exits, failed trims, non-runscript inputs, first
   numerical divergence and nonfinite differences. Add focused engine traces
   where normal output cannot explain a difference. Assess non-turbine
   behavior as well as the intended turbine changes.
4. Prepare native-only upstream slices from refreshed upstream plus verified
   prerequisites, preserving canonical checkout/user work and existing
   published refs. Keep #1505/#1508 corrections separate from structural and
   behavioral follow-ups. Avoid carrying fork-only SDK, wheel or idle-flow
   changes as accidental prerequisites. Test each exact proposed source;
   integration-source success alone does not qualify an extracted patch.
5. Draft contribution descriptions and migration/review notes using concrete
   before/after examples. Include changed off-engine trim behavior, real
   function/restore limitations and measured tests; withdraw any stale
   “unchanged behavior” claim. Explain how useful immediate RunIC readback
   survives and how explicit refresh differs. Do not post the drafts.

## Exit

Write `reports/06-native-validation.md`, proposed contribution identities and
draft text under this plan's docs directory, and durable results under the
matching validation evidence directory. Update the plan status with reviewed
commits and exact test evidence, keeping upstream publication/merge separate.

Native acceptance requires resolved correctness failures and explained
compatibility changes. A maintainer preference about API spelling can remain
an upstream discussion item; an undefined fuel/restore/RunIC behavior cannot.
Record any further native upstream review needs without blocking real SDK
integration on mere lack of maintainer response. Stage 7 starts from the
accepted full integration source, not a reduced upstream slice.
