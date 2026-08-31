# TermsGuard repository audit — 2026-08-31

Audited source: commit `faddded4d91fd192f6d2b90d72e3353f21212837` (v2.3).

## Immediate hotfixes included in this archive

- Correct GenLayer numeric transaction status mapping in `frontend/lib/genlayer.ts`.
- Recognize all current lifecycle stages used by GenLayer, including appeal/finality stages.
- Normalize numeric execution-result codes so `FINISHED_WITH_ERROR` is not missed.
- Read `statusCode` when an RPC response exposes a numeric status there.
- Treat `READY_TO_FINALIZE` as an accepted/readable state.
- Prevent background finality watcher failures from becoming unhandled promise rejections.
- Make the transaction progress indicator reflect the actual lifecycle stage.
- Do not display a baseline-only project as `100/100`; a score is meaningful only after verification.

## Important findings not silently changed

1. TermsGuard is not yet truly automatic monitoring. There is no scheduler/cron/keeper in the repository. The UI can start a monitoring record and can run verification, but nothing periodically invokes `verify_project` on its own.
2. A new website currently requires multiple signed writes: `create_project`, `auto_capture`, and `verify_project`. The UI is one-click, but the chain workflow is not one transaction.
3. `refresh()` can perform hundreds of sequential RPC reads (up to 100 projects + 300 commitments + 500 verifications). This can make the UI feel stalled and is the main frontend performance issue.
4. The contract is permissionless: any wallet can create projects, add commitments to any project, capture a baseline, and verify. This may be acceptable for a public registry, but it permits spam/pollution and should be an explicit product decision.
5. URL validation is only a prefix check. Malformed HTTP(S) strings can reach the web renderer.
6. The contract stores only extracted baseline facts, not the source snapshot itself. This is compact, but evidence reproducibility is weaker than storing a content hash / normalized snapshot reference.
7. The LLM output is structurally parsed, but there is no complete deterministic schema/invariant validation for every returned field before storage. `response_format="json"` is good and documented, but JSON validity is not the same as semantic schema validation.
8. The current score is supplied by the LLM and clamped to 0–100, but there is no deterministic mapping from status to score. A malicious/poor model response could therefore produce an inconsistent score/status pair.
9. Deadline evaluation is delegated to the LLM. The current date is not explicitly supplied as deterministic input, so deadline conclusions should not be treated as a hard date calculation.
10. The direct-test CI job only installs `pytest` from `requirements.txt`; the contract tests import GenLayer tooling. The repository should pin/install the actual GenLayer testing SDK before claiming contract CI is complete.
11. The frontend has no explicit `accountsChanged` / `chainChanged` subscription, so the displayed wallet can become stale after a wallet/network switch.

## Git history / regression risk

The repository has a very rapid sequence of commits from Aug 25–30 with generic messages (`v2`, `update`, `up`, `v2.2`, `v2.3`). The latest v2.3 commit changed the README, contract, frontend page, and GenLayer integration layer in one step. This makes regressions harder to isolate.

The most important regression is in the transaction-status mapper: it used an outdated numeric mapping where `2` was treated as COMMITTING, `3` as ACCEPTED, and `4` as FINALIZED. Current GenLayer status codes are `1=PENDING`, `2=PROPOSING`, `3=COMMITTING`, `4=REVEALING`, `5=ACCEPTED`, `7=FINALIZED`. This can make the UI report the wrong stage and can make finality handling incorrect.

## Deployment recommendation

The hotfix in this archive is frontend-only apart from the baseline-score presentation change. It does not require changing the deployed contract address. Keep the currently deployed contract unless a separate contract redeploy is intentionally planned.

Before a new contract deployment, run the GenLayer linter and direct tests, then do a small Studio integration test. Current GenLayer documentation recommends starting with Direct Mode and using Studio for full consensus/network behavior.
