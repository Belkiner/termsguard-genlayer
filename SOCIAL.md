# TermsGuard Social — X promises beta

Status: implementation in review, not a deployed or independently audited service.
The existing policy contract and its address remain unchanged. The new module has its own state and address; it does not remove GenLayer execution or X API costs.

## Scope

1. Open `/social`, paste a public X/Twitter post URL and load it through the official X API.
2. Copy an exact, measurable future promise excerpt. Add a deadline only if supported by that post.
3. The wallet calls the separate `TermsGuardSocial.capture_promise(post_id, start, length, deadline)` contract. Positions count Unicode code points, not JavaScript UTF-16 units.
4. Validators retrieve the source through the configured relay and assess the promise. The contract records post ID, excerpt position, fingerprints, deadline and registering wallet. Identical registration by that wallet is idempotent.
5. Select a record and provide a separate public HTTPS evidence page. Only its registering wallet may call `verify_promise`.
6. The contract re-fetches the original post and checks its fingerprint before assessing evidence. Changes or unavailable posts yield `UNVERIFIABLE`. All verification events remain in paginated history.

Only original post text is imported. Attached media, quoted posts, threads, account monitoring, OAuth ownership verification, automatic schedules and X links as evidence are not implemented.

Statuses: `FULFILLED` requires evidence of all promised work; `PARTIAL` requires evidence of partial completion; `OPEN` represents a supported open promise; `BROKEN` requires evidence of contradiction/noncompletion, not simply an elapsed date; `UNVERIFIABLE` covers insufficient or unreadable sources. No artificial 0–100 trust score is assigned.

The frontend polls transaction status, saves the hash locally, refreshes results after confirmed execution and provides read-only resume. `ACCEPTED` is provisional, `FINALIZED` is finality, and neither substitutes for checking execution. `MAJORITY_AGREE` is a consensus receipt result, not proof that an external claim is true. A finalized transaction with unknown execution is shown as unconfirmed. Use Refresh if a read endpoint is temporarily behind.

## Source trust and data lifecycle

X bearer credentials remain exclusively in the server route. Validators use that public relay, so a compromised operator could substitute source data. Consensus is not independent X authentication. Evidence pages can also make false claims; output is a source-attributed assessment, not an audit certificate.

The relay caches post text for five minutes. The browser expires displayed imports after five minutes. Contract state and capture arguments contain no original post body or username; they contain IDs, positions and hashes. Evidence-page excerpts and verification results are public on-chain. Runtime/provider logging and X plan permissions must be checked before public launch; this implementation is not a determination of compliance with every X term.

X requires developers to handle changes and removals: [Developer Agreement](https://docs.x.com/developer-terms/agreement). Hash-based capture deliberately cannot recover a removed original. Do not replace it with permanent raw-tweet storage.

## Configure and deploy

Use the **Belkiner/termsguard-genlayer** repository and its existing Vercel project (frontend root). Apply this branch as one change set; do not copy files into another repository.

1. Configure server-only Vercel environment variables for the selected deployment environment:

   | Variable | Value |
   |---|---|
   | `X_BEARER_TOKEN` | Your X app bearer token; never put it in chat, GitHub or a `NEXT_PUBLIC_` variable |
   | `UPSTASH_REDIS_REST_URL` | HTTPS REST URL of an Upstash Redis database |
   | `UPSTASH_REDIS_REST_TOKEN` | Server-side Redis REST token |
   | `X_DAILY_LOOKUP_LIMIT` | A deliberate daily request cap, e.g. `20` for a small test |

   Redis is required for the shared cache and atomic budget. Without configuration, with a zero cap, or if Redis fails, imports fail closed. The cap counts attempted upstream lookups, including failures; it is not a monetary cap. Author expansion and your X plan determine actual billing. A public user can consume this shared quota; configure hosting rate limits for wider release. Preview and production should use separate Redis databases if budgets must be independent. No database or paid API subscription is created by this code.

2. Deploy the frontend/API to a stable HTTPS hostname. Without a social address the page allows import preview but disables contract actions.
3. Test `/api/social/posts/<real-post-id>`: expect normalized `id`, `author_id`, `username`, `text`, `created_at`, `url`. Never include bearer tokens in the URL. Confirm an invalid ID returns 400 and an unavailable post does not produce fake text.
4. In GenLayer Studio, deploy **`contracts/terms_guard_social.py` as a new contract**, with constructor `relay_url` equal to `https://termsguard-genlayer.vercel.app/api/social/posts` (or the stable hostname actually deployed in step 2). The relay is immutable; changing it requires another deployment. Confirm the pinned runner is supported by the selected network.
5. Set `NEXT_PUBLIC_SOCIAL_CONTRACT_ADDRESS` to the newly deployed address. Keep `NEXT_PUBLIC_CONTRACT_ADDRESS` pointing to the existing policy contract. Both modules use the existing `NEXT_PUBLIC_NETWORK`; deploy the social contract on that same network.
6. Redeploy frontend because `NEXT_PUBLIC_` settings are embedded at build time.
7. Complete the live acceptance checks below before marking the roadmap item Complete.

## Live acceptance checks still required

- Use an authorized test post containing an explicit measurable promise; import it and register its exact excerpt. Manually approve the wallet transaction. Record its hash and confirm execution plus finality.
- Reload mid-transaction and use Resume checking; it must not request another signature or duplicate the record.
- Register the same selection again deliberately: record count must stay unchanged.
- Use a controlled public evidence page with explicit completion; confirm `FULFILLED` with source evidence. A page only repeating the future promise must not pass as completion. Model/consensus behavior cannot be established by mocked tests.
- Verify with another wallet: contract must reject it.
- Change/remove the original test post, wait for cache expiration and verify: expect `UNVERIFIABLE`.
- Test API quota exhaustion, X access errors, unavailable evidence and wallet rejection; no successful result should be invented.
- Confirm old website-policy capture and verification still work.

## Local verification

From the repository root, install existing frontend dependencies then run:

```sh
npm --prefix frontend ci
npm --prefix frontend run build
node tests/x-api.test.mjs
python tests/validate_social_sdk.py --linter-src /path/to/genvm-linter/src --runtime-cache /path/to/extracted/v0.3.0-rc7.tar
```

The Python runner needs the official `genvm-linter` source, NumPy, and the extracted pinned runner/stdlib/protobuf runtime. It uses real SDK storage with mocked HTTP, model and consensus calls. This validates schema and deterministic guards, not network deployment or LLM accuracy.

Locally checked: pinned SDK schema generation and linter; real SDK in-memory storage, ownership, deduplication, invalid input, source changes/unavailability and history; mocked API URL validation/cache/quota/fail-closed behavior; frontend production build and TypeScript. Live API and signed social-contract tests await the user's credentials and deployed address.

## Files

- `contracts/terms_guard_social.py`: separate contract; do not replace `contracts/terms_guard.py`.
- `frontend/app/api/social/posts/[id]/route.ts`, `frontend/lib/x-post.ts`: server import and normalization.
- `frontend/lib/social.ts`, `frontend/app/social/*`: social wallet client and page.
- `frontend/app/page.tsx`: navigation link only.
- `frontend/app/roadmap/page.tsx`, `ROADMAP.md`: X milestone marked In review.
- `tests/x-api.test.mjs`, `tests/contract_cases.py`, `tests/validate_social_sdk.py`: verification helpers.

Rollback: revert this change set and remove social-only environment variables. The original policy contract requires no migration. Already published social-chain data cannot be erased by reverting the frontend.
