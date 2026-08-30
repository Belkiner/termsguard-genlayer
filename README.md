# TermsGuard

TermsGuard turns a public project URL into a consensus-backed monitoring record.

## User flow

The normal flow is intentionally one-click:

1. Paste a public URL.
2. Click **Protect & verify**.
3. Approve the on-chain transaction for baseline capture.
4. Approve the on-chain transaction for the first live verification.
5. TermsGuard reads the current contract state and keeps watching the transaction until finalization.

The frontend distinguishes **ACCEPTED** from **FINALIZED**. Acceptance means GenLayer has accepted the execution; finalization is a later lifecycle stage. A slow finalization is not reported as a contract failure.

## What the contract actually checks

At baseline time, GenLayer renders the public page and extracts:

- material policy facts
- measurable public commitments
- deadlines when explicitly stated

At verification time, GenLayer renders the same URL again and compares the live page with the stored baseline and registered commitments.

Commitment results are:

- `FULFILLED` — current evidence explicitly supports completion
- `PARTIAL` — some evidence supports the promise
- `OPEN` — the promise is still future-facing or completion is not demonstrated
- `BROKEN` — current evidence contradicts the promise or a stated deadline is missed
- `UNVERIFIABLE` — the source does not contain enough evidence

`UNVERIFIABLE` is a valid result. It is not silently converted into success.

## Important: live data

There are no demo results in the live path. The contract uses GenLayer web rendering at transaction execution time and asks the LLM for structured JSON. `response_format="json"` is used to reduce malformed model output, while comparative consensus checks independent results. GenLayer documents this as the recommended pattern for structured LLM calls. 

## Contract

The first line of `contracts/terms_guard.py` is mandatory:

```python
# { "Depends": "py-genlayer:1jb45aa8ynh2a9c9xn3b7qqh8sm5q93hwfp7jqmwsfhh8jpz09h6" }
```

Do not remove it. Removing it causes:

`VM_ERROR invalid_contract absent_runner_comment`

The contract keeps the existing storage structures:

- Project
- Commitment
- Verification

The v2 changes are behavior-only within those structures, so an authorized GenLayer upgrade can preserve existing state.

If Studio reports `Only contract deployer can upgrade`, the connected wallet is not authorized to upgrade that deployed instance. Deploy the fixed contract as a new instance and put its address in Vercel.

## Frontend

The frontend uses static GenLayer chain definitions instead of dynamically indexing the `chains` module. This avoids the TypeScript error where `createClient({ chain })` receives `{}` instead of a typed GenLayer chain.

Required Vercel variables:

```text
NEXT_PUBLIC_CONTRACT_ADDRESS=<deployed contract address>
NEXT_PUBLIC_NETWORK=studionet
```

For Vercel, set the project Root Directory to:

```text
frontend
```

Build command:

```text
npm run build
```

Install command:

```text
npm install
```

## Testing a real source

Do not use a GitHub repository shell as the first verification target. GitHub pages can return mostly navigation, scripts and framework HTML to the GenLayer renderer.

Use a public Terms, policy, roadmap or documentation page that contains an explicit measurable statement.

A good test sequence is:

1. Register the public page.
2. Let **Protect & verify** capture the baseline and run the first verification.
3. Open **Advanced** or **Audit** and inspect the evidence.
4. Change one public statement on a page you control, or use a real public page whose documented policy/roadmap has actually changed.
5. Run **Verify again**.
6. Confirm that the result changes only when the current source provides evidence for that change.

For a page with no explicit evidence for the commitment being tested, `UNVERIFIABLE` is expected and correct.

## Verification and finality

A GenLayer write returns a transaction hash first. State changes are not instant. The app waits for consensus acceptance, refreshes state, and continues monitoring finalization in the background.

The GenLayer SDK documents both `ACCEPTED` and `FINALIZED` transaction stages and recommends checking the execution result before treating a transaction as successful.

## Local checks

Python source files are syntax-checked in this package. Full frontend build verification requires installing the locked npm dependencies because they are not vendored in the ZIP.
