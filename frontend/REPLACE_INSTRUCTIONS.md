# TermsGuard patch — 2026-09-01

Replace exactly these files in the existing repository:

- `contracts/terms_guard.py`
- `frontend/lib/types.ts`
- `frontend/lib/genlayer.ts`
- `frontend/app/page.tsx`

No other repository files are required to be changed by this patch.

## What this patch fixes

1. HTTP 404/5xx and web-render failures are converted to `UNVERIFIABLE` instead of crashing the contract.
2. Baseline/verification extraction uses `prompt_non_comparative`, so validators judge the leader result against the same source instead of trying to produce identical free-form JSON.
3. Output is bounded: 10 facts, 6 commitments, short evidence.
4. Frontend checks execution result and consensus result, not only `FINALIZED`.
5. `MAJORITY_DISAGREE`, `UNDETERMINED`, `contract_error` and execution errors are displayed as failures.
6. The transaction panel stays visible while consensus/finality is running.
7. `Protect website` automatically starts the verification after a successful baseline.
8. Existing storage structures and the important public methods are retained.

## Important

This patch is designed for a **new deployment of the contract**. Do not overwrite the existing on-chain contract address: a contract's code cannot be replaced merely by changing GitHub files.

After deploying the patched contract, update only `NEXT_PUBLIC_CONTRACT_ADDRESS` in the Vercel project to the new contract address and redeploy.

The frontend keeps the same supported network names: `localnet`, `studionet`, `testnetAsimov`, `testnetBradbury`.
