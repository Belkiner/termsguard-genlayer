# TermsGuard Roadmap

[Open the website roadmap](https://termsguard-genlayer.vercel.app/roadmap) · [Use TermsGuard](https://termsguard-genlayer.vercel.app/)

TermsGuard helps people understand changes to public policies and track project commitments with evidence. This roadmap describes planned improvements, not functionality already delivered.

Updated: 13 September 2026. Milestones 1–6 are **Planned**; the X integration is **In review**. Some underlying capabilities already exist; a milestone becomes Complete only after the published version meets its acceptance criterion. Order and scope may change. No delivery dates are committed.

## 1. Reliable verification

**Status: Planned**

Make every verification dependable, from submission to the final result.

Scope: Correct transaction statuses and recovery by transaction hash; automatic result refresh; documentation aligned with the deployed product.

Acceptance: The complete verification flow passes acceptance tests without a manual page reload.

## 2. Clear results

**Status: Planned**

Understand what changed and why it matters.

Scope: Before-and-after comparisons; source quotations and verification time; separate explanations for policy scores and commitment outcomes.

Acceptance: A controlled page change produces an understandable report with supporting evidence.

## 3. Personal watchlist

**Status: Planned**

Keep the projects you care about in one place.

Scope: Saved projects; change history; unread results and clear last-checked timestamps.

Acceptance: Users can return to their saved projects and identify new results.

## 4. Telegram notifications

**Status: Planned**

Receive useful updates without repeatedly opening the dashboard.

Scope: Opt-in result notifications and verification reminders; links to reports; notification preferences and unsubscribe controls.

Acceptance: Subscribers receive relevant notifications with working report links and can unsubscribe.

## 5. Scheduled checks

**Status: Planned**

Keep checks running at a frequency and cost you choose.

Scope: A server-side scheduler; explicit execution funding and spending limits; retry handling for technical failures.

Acceptance: Checks run on the configured schedule within the selected budget, with visible failures.

## 6. GitHub and DAO evidence

**Status: Planned**

Check public promises against more than one source.

Scope: Evidence from GitHub releases and documentation; import of approved Snapshot proposals; source attribution per commitment.

Acceptance: A commitment can be assessed using multiple linked sources, distinguishing a decision from its implementation.

## Status definitions

- **Planned:** proposed scope; work is not represented as delivered.
- **In progress:** implementation has started.
- **In review:** implementation is being tested before release.
- **Complete:** published and checked against its acceptance criterion, with release or test evidence linked here.

## Feedback and updates

[Suggest an improvement or report a problem](https://github.com/Belkiner/termsguard-genlayer/issues). Link implementation issues and pull requests beneath the relevant milestone as they are created. Update this file and the website roadmap together whenever scope or status changes.

Future idea: monitor TermsGuard's own published commitments using TermsGuard. This would demonstrate the product, not constitute an independent audit.



## 7. X post promises

**Status: In review**

Import one public X post, register a measurable promise in a separate contract, and assess it against a public evidence page. Post text is retrieved when needed; the contract stores IDs and fingerprints. Changed or unavailable originals cannot be verified.

Acceptance: capture, fulfillment verification, unavailable-source handling and transaction recovery pass on the configured network. API configuration, contract deployment and live acceptance tests are still required. See [SOCIAL.md](SOCIAL.md).
