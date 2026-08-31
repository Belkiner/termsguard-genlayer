# TermsGuard critical hotfix — 2026-08-31

## What was changed

### Frontend
- Transaction progress is no longer hidden after a non-final result/timeout.
- Added wallet `accountsChanged` and `chainChanged` listeners.
- Refresh reads are batched (20 at a time) instead of hundreds of sequential RPC calls.
- Prevented overlapping refresh operations.
- Verification state checks now compare against a transaction-time verification count instead of the possibly stale UI history length.
- Added a visible refresh/loading state.
- Existing GenLayer numeric transaction status mapping from v2.3 is preserved.

### Smart contract
No contract rewrite was made in this hotfix.

The reported `gen_getContractSchemaForCode` error is:
`TypeError: public method names should not start with __, __receive__`

The submitted `TermsGuard` source does not define `__receive__`; it inherits GenLayer's special method from `gl.Contract`. Current official GenLayer documentation explicitly documents `__receive__` as a supported special method and continues to use the same `py-genlayer` pin in the current contract examples. Therefore changing TermsGuard business logic to work around this schema-generator/runtime mismatch would be unsafe and could break the intended contract behavior.

The correct next action for this blocker is to verify the same source against the current Studio/GenVM runtime. If the runtime still emits this exact error, it is a platform/schema compatibility issue rather than a TermsGuard method/type error.

## Validation performed in this environment
- Static source inspection completed for the contract, frontend, CI, tests and audit report.
- The frontend dependency install could not complete because the execution environment has no cached npm registry packages; therefore a real `next build` could not be run here.
- No claim is made that the contract has been successfully redeployed from this environment.

## Important existing audit findings still open
1. No scheduler/keeper exists yet, so monitoring is not truly periodic on-chain.
2. New monitoring still requires three signed writes (`create_project`, `auto_capture`, `verify_project`).
3. Contract remains permissionless.
4. Baseline stores extracted facts, not a source snapshot/hash.
5. LLM schema/invariant validation is incomplete.
6. Deadline evaluation is delegated to the LLM.
7. CI does not install the actual GenLayer test/lint packages.
