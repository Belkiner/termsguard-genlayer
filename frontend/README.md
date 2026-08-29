# TermsGuard Ready

This is a production-oriented TermsGuard frontend and GenLayer contract redesign.
It is intentionally not a copy of the old UI. The user flow is built around the
job to be done:

1. Paste a public website.
2. Protect website.
3. TermsGuard captures a consensus-backed baseline and discovers meaningful public commitments.
4. Verify current website.
5. Review useful evidence and status in Simple, Advanced or Audit mode.

## Modes

### Simple
One workflow for normal users. The UI hides contract mechanics and explains what
is happening in plain language.

### Advanced
Manual commitment anchoring, source category controls and direct verification.

### Audit
Contract address, network, consensus-backed verification records and evidence.

## Important architecture

The contract keeps the original storage layout:

- Project
- Commitment
- Verification

The v2 code adds behavior without changing those persistent fields, so it is suitable
for an authorized GenLayer upgrade if the deployed contract's upgrader account is yours.
GenLayer only allows an address present in the contract's upgraders list to modify locked
code; if your wallet is not the authorized upgrader, deploy a new instance instead.

## Data freshness

The contract uses `gl.nondet.web.render(..., mode="text", wait_after_loaded="3s")`
for the current public page. It does not store a fake demo result in live mode.

The verification transaction is intentionally split into:
- automatic baseline + commitment discovery
- current verification

That keeps the heavy web/LLM work bounded and makes the UI easier to recover from.

## Transaction behavior

The frontend treats ACCEPTED and FINALIZED as different states.

ACCEPTED means the contract execution has been accepted and the new state can be read.
FINALIZED means the appeal/finality window has completed.

A slow FINALIZED transition is never shown as a contract failure. The app continues
watching it in the background. This avoids the old false timeout behavior.

## Deploy

### 1. Contract

Use `contracts/terms_guard.py` in GenLayer Studio.

If you own the deployed contract's upgrader account, upgrade the existing contract.
The existing storage layout is preserved.

If Studio says `Only contract deployer can upgrade`, the connected account is not
authorized. Do not keep retrying with a different code file. Deploy this v2 contract
as a new instance and use its address in Vercel.

### 2. Frontend

Set:

`NEXT_PUBLIC_CONTRACT_ADDRESS=<your deployed contract address>`

`NEXT_PUBLIC_NETWORK=studionet`

Then:

`npm install`

`npm run typecheck`

`npm run build`

For Vercel:
- Framework: Next.js
- Root Directory: `frontend` if these files are inside an existing monorepo frontend folder
- Build Command: `npm run build`
- Install Command: `npm install`

## First real test

Use a public project page that actually contains measurable promises, fees, dates,
or policy conditions. Avoid a GitHub repository shell as the first test because
GitHub HTML can be mostly navigation/scripts rather than readable project content.

A good test is:
- baseline the page
- verify without changing it → expect NO_CHANGE or fulfilled/open commitment states
- edit the public page so one measurable promise changes
- verify again → expect LOW/HIGH/CRITICAL or BROKEN depending on the evidence

Do not expect every public page to produce a positive result. UNVERIFIABLE is a valid
security outcome when the source does not contain enough evidence.
