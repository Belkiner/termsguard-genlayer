# TermsGuard 2.0 — GenLayer Semantic Commitment Registry

TermsGuard turns public project promises, policies and milestones into a verifiable on-chain history.

Instead of a simple website diff, the dApp records a baseline, registers commitments, fetches current public evidence and asks GenLayer validators to adjudicate semantic meaning.

## Core features

- **Project Registry** — register a public source such as terms, docs, roadmap, privacy or tokenomics.
- **Consensus Baseline** — fetch and store a bounded baseline through GenLayer web access.
- **Policy Verification** — detect material changes to fees, eligibility, governance, privacy, tokenomics, deadlines and legal/security conditions.
- **Commitment Registry** — record a public statement plus an optional deadline.
- **Commitment Adjudication** — classify evidence as `FULFILLED`, `PARTIAL`, `OPEN`, `BROKEN` or `UNVERIFIABLE`.
- **Audit Trail** — store every verdict with score, summary and evidence.
- **Demo Mode** — the frontend works before a contract address is configured.
- **GenLayer Live Mode** — set the deployed contract address and the same UI reads/writes the Intelligent Contract.

## Architecture

```text
Next.js 15 + TypeScript
        │
        │ GenLayerJS
        ▼
TermsGuard Intelligent Contract
        │
        ├── public web source
        ├── LLM semantic analysis
        └── GenLayer equivalence / validator consensus
        │
        ▼
On-chain project + commitment + verification history
```

## Requirements

- Node.js 20+
- Python 3.12+
- GenLayer CLI for contract work
- A browser wallet compatible with your GenLayer environment

The official GenLayer boilerplate currently uses Python 3.12+, a production Next.js 15 frontend with TypeScript, direct tests, integration tests, linting and deployment tooling. This project follows that current structure while keeping the UI intentionally dependency-light. 

## 1. Install

```bash
git clone YOUR_GITHUB_REPOSITORY
cd termsguard-genlayer
python -m venv .venv
```

Windows PowerShell:

```powershell
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

Linux/macOS:

```bash
source .venv/bin/activate
pip install -r requirements.txt
```

Install the GenLayer CLI:

```bash
npm install -g genlayer
```

Install frontend dependencies:

```bash
cd frontend
npm install
cd ..
```

## 2. Validate the contract

Run direct tests:

```bash
pytest tests/direct -v
```

Run the GenLayer linter if the CLI is installed:

```bash
genvm-lint check contracts/terms_guard.py
```

If your installed CLI exposes the linter under a different executable, use the command shown by `genlayer --help`.

## 3. Deploy to hosted GenLayer Studio / Studionet

The simplest path is the hosted Studio:

1. Open GenLayer Studio.
2. Create a new Intelligent Contract.
3. Add `contracts/terms_guard.py` from file.
4. Run/debug it.
5. Deploy it.
6. Copy the resulting contract address.

The contract constructor has no arguments.

CLI alternative:

```bash
genlayer network studionet
genlayer deploy --contract contracts/terms_guard.py
```

For final testing, use Testnet Bradbury according to the current GenLayer network configuration.

## 4. Configure the frontend

Create:

```text
frontend/.env.local
```

with:

```env
NEXT_PUBLIC_CONTRACT_ADDRESS=0xYOUR_DEPLOYED_CONTRACT
NEXT_PUBLIC_NETWORK=studionet
```

Then:

```bash
cd frontend
npm run dev
```

Open `http://localhost:3000`.

If the contract address is empty, the app intentionally stays in Demo Mode.

## 5. Vercel deployment — free frontend

1. Push the repository to GitHub.
2. Import the repository into Vercel.
3. Set **Root Directory** to `frontend`.
4. Framework preset: Next.js.
5. Add environment variables:

```text
NEXT_PUBLIC_CONTRACT_ADDRESS = your deployed address
NEXT_PUBLIC_NETWORK = studionet
```

6. Deploy.

The frontend does not need a private key. Transactions are signed in the user's browser wallet.

## 6. Recommended testing order

```text
1. Demo Mode UI
2. Direct contract tests
3. GenVM linter
4. Hosted Studio deployment
5. Register project
6. Capture baseline
7. Verify policy
8. Add commitment
9. Verify commitment
10. Deploy frontend to Vercel
11. Final test on Testnet Bradbury
```

## Contract methods

### Views

- `get_project_count()`
- `get_project(project_id)`
- `get_commitment_count()`
- `get_commitment(commitment_id)`
- `get_verification_count()`
- `get_verification(verification_id)`

### Writes

- `create_project(name, url, category)`
- `capture_baseline(project_id)`
- `add_commitment(project_id, statement, deadline)`
- `verify_project(project_id)`
- `verify_commitment(commitment_id)`

## Important limitations

1. The contract stores bounded page snapshots. It is not a full web archive.
2. Public pages can change or become unavailable; `UNVERIFIABLE` is a valid outcome.
3. A commitment is only as strong as the public evidence available to validators.
4. Semantic verification is probabilistic/consensus-based, not a legal opinion.
5. For production use, add source allowlists, stronger prompt-injection defenses, per-project authorization and a dedicated evidence hashing layer.

## Why GenLayer is essential

The application needs to decide whether two pieces of public language are materially equivalent and whether a current page actually supports a natural-language commitment. Those are semantic judgments over live web data rather than deterministic key/value lookups. GenLayer Intelligent Contracts can access web data and use validator consensus around non-deterministic web/LLM execution.

## License

MIT

