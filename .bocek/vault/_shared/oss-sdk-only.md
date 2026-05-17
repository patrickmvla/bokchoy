---
type: decision
features: [project-shape, sdk, marketing]
related: ["[[marketing/oss-core-marketing-research]]", "[[marketing/landing-patterns-research]]", "[[backend-service-shape]]"]
created: 2026-05-14
confidence: high
---

# BokChoy is OSS-SDK-only: public client libraries + shared wire-shape types; backend, cockpit, and auth-config stay proprietary

## Decision

BokChoy ships under a **mixed-source model**: client SDKs and shared TypeScript wire-shape types are open-source under MIT; backend services, cockpit admin UI, and Better Auth configuration are proprietary.

**Open-source surface (public GitHub repos under `github.com/bokchoy`):**
- `bokchoy/sdk-node` — server-to-server TypeScript SDK
- `bokchoy/sdk-unity` — Unity C# SDK
- `bokchoy/sdk-unreal` — Unreal Engine C++ SDK
- `bokchoy/sdk-godot` — Godot GDScript SDK
- `bokchoy/shared-types` — TypeScript types of the public API wire shape (mirrors `@bokchoy/admin-list-endpoints-contract`)

**Closed-source surface (kept private in the monorepo):**
- `@bokchoy/backend` (Hono service + all module handlers)
- `@bokchoy/wallet`, `@bokchoy/db`, `@bokchoy/auth-config` (backend internals)
- `@bokchoy/cockpit` (admin UI, marketing pages, all `apps/cockpit/` source)

**License:** MIT for all 5 OSS repos. Single `LICENSE` file per repo; no `NOTICE` file; no patent-grant clause to maintain.

**Contributor mechanism:** DCO (Developer Certificate of Origin) — `Signed-off-by: Name <email>` in commit messages. No CLA.

**Security disclosure:** `SECURITY.md` in every OSS repo; `security@bokchoy.com` (or equivalent canonical address) as the disclosure channel; 90-day responsible-disclosure window before public CVE.

**Repo structure:** per-SDK repos, NOT monorepo. `bokchoy/sdk-node` is independent of `bokchoy/sdk-unity` independent of `bokchoy/sdk-unreal`, etc. `bokchoy/shared-types` is its own npm-published package consumed as a peer dep by `sdk-node` and (transitively) by the closed cockpit.

## Reasoning

User defense (2026-05-14) for Position C (OSS-SDK-only) over A (full proprietary), B (full OSS), and H (defer):

> *"good to get patches from people actually using the product and makes it easy to receive sdk updates"*

Two distinct claims, both production-cited:

**(i) Patches from users.** Game devs hit Unity/Unreal/Godot glue-code edge cases in production and submit fixes. PostHog's `posthog-js` repo has 200+ contributors; PostHog Unity SDK has 50+. **Production-cited: PostHog, Stripe, Resend, Better Auth — all receive substantial community SDK PRs.** Confidence: high.

**(ii) Distribution simplicity.** Public npm + standard OSS license is how every commercial dev-tool ships SDKs. The alternative (private registry, per-customer access) is hostile to the developer experience that BokChoy's marketing positions as the value prop. **Production-cited: universal across the surveyed commercial dev-tool class.** Confidence: high.

The two defenses are **operational**, not strategic — the user did not claim OSS-SDK is a differentiator. That's correct framing per `[[marketing/oss-core-marketing-research]]` F10: OSS-SDK is industry-standard floor, not a strategic moat. Position C earns the vault on operational grounds; whether OSS-SDK alone unlocks F10's trust-signal substitute strategy at the load-bearing scale remains weak (SDK stars are weaker signal than backend stars). The marketing site's trust-signal substitute strategy at v1 will therefore rely primarily on **technical-trust signals** (audit-log, defense-in-depth, Postgres-native) per F10, with SDK GitHub presence as a supporting weak signal — not the load-bearing one.

## Engineering substance applied

- **Failure semantics:** SDK bugs hit clients, not server-side data integrity. Wallet-credit/wallet-debit invariants remain enforced server-side per `[[wallet-mechanics]]` regardless of what the SDK ships. A buggy SDK can still pass invalid input to the server; the server is the trust boundary. **No change to backend trust posture required.**
- **Security boundary:** SDK is the client-trust tier. Authorization decisions never rely on SDK-computed values — they go through `auth.api.getSession()` / `adminGate` / RLS at the backend. SDK exposure does not change the security boundary; it only changes who reads the SDK source. (Adversaries can already inspect the SDK in any deployed game binary; OSS-ing it removes one weak obfuscation that wasn't actually protecting anything.)
- **Observability:** SDKs should ship version reporting in request headers (e.g., `User-Agent: bokchoy-sdk-unity/1.2.3`) so the backend can detect old SDK usage and surface deprecation paths. Not vaulted as a sub-decision here; flagged as a downstream implementation concern when first SDK lands.
- **Lock-in:** OSS-SDK reduces customer lock-in compared to proprietary-SDK (customers can fork if BokChoy disappears). This is a real customer-side benefit that defangs one of the most common B2B-SaaS objections.

## Production-grade gates

- **Idiomatic:** OSS-SDK + proprietary-backend is the dominant commercial-dev-tool pattern. Production-cited × 4 (Stripe, Resend, Clerk, RevenueCat all ship this exact shape per `[[marketing/landing-patterns-research]]`). MIT + DCO + per-repo SDKs are the standard defaults across the ecosystem. Confidence: high.
- **Industry-standard:** ≥2 production cites with provenance: **Stripe** (`stripe-node`, `stripe-python`, etc., all per-language repos, MIT-licensed, public on GitHub; backend services private) and **Resend** (`resend-node`, `resend-go`, etc., OSS SDKs, backend proprietary). Both observed in `[[marketing/landing-patterns-research]]` and `[[marketing/oss-core-marketing-research]]`. Plus **PostHog** as a SDK-OSS reference even though their backend is also OSS (the SDK side specifically demonstrates community-contribution dynamics at scale).
- **First-class:** MIT + DCO + GitHub-as-source-of-truth are the platform-standard defaults. No fighting npm package conventions, no fighting GitHub's contributor tooling expectations, no fighting OSI's OSS definition. The decision uses platform primitives.

## Rejected alternatives

### A — Full proprietary (no public source)

**What:** Backend + cockpit + SDK all private. No public GitHub repos for product code. SDKs distributed via private npm registry with per-customer access tokens, OR via authenticated downloads from `bokchoy.com/sdk/...`.

**Wins when:** Strategic optionality is the dominant concern (closing later is impossible without hostile blowback). The product class has no upside from community contributions (e.g., obscure proprietary domain). Public CVE disclosure is undesirable (a single 0day in a tiny shop is devastating).

**Why not here:** Forfeits the operational benefits the user defended (patches in, distribution out). The SDK class specifically benefits from community contributions — game devs hit glue-code bugs and DO submit fixes when the path is low-friction. Private-npm distribution is the dev-experience hostile path that contradicts BokChoy's marketing positioning. The CVE concern doesn't apply to SDK-only scope: SDK CVEs are typically lower-severity than backend CVEs (client-side bugs vs ledger-corruption bugs).

### B — Open-source the backend (full OSS-core)

**What:** Public GitHub repos for the entire product including backend, cockpit, wallet, db. License sub-fork: MIT/Apache (permissive — anyone can re-host commercially), AGPL (copyleft — re-hosters must contribute back; enterprises avoid AGPL deps), BSL/fair-source (source-available; blocks competitive re-hosting for N years; not OSI-OSS).

**Wins when:** Trust-signal substitute strategy at v1 must be load-bearing AND OSS-stars are the substitute (F10 from `[[marketing/oss-core-marketing-research]]`). Audience values audit access (e.g., game devs storing player virtual currency might genuinely care). OSS-as-hiring-funnel is a primary recruiting strategy. Long-term defensibility comes from network effects + brand, not code secrecy.

**Why not here:** Three reasons stack:
1. **Brand-protection load.** Permissive license → competitive re-hosting risk (Elastic vs OpenSearch, Redis vs Valkey). AGPL/BSL each have countervailing costs (AGPL spooks enterprise legal; BSL isn't OSI-OSS so doesn't unlock the full marketing benefit).
2. **Product class fit is weak.** Game devs don't fork their backend infra the way PostHog's product-engineer audience contributes. The community-contribution upside of full-OSS backend doesn't apply.
3. **Close-later cost is hostile.** Elastic, Redis, HashiCorp all generated massive community blowback re-licensing. Strategic optionality matters at pre-revenue stage.

### H — Defer the decision

**What:** Don't decide now. The de facto private-repo state runs until customers explicitly ask "is this open source?" — at that signal, revisit.

**Wins when:** No specific information demands deciding now AND the cost of delay is low AND the cost of premature commitment is high. Cost asymmetry favors deferral when the question's answer hasn't surfaced naturally from customer signal.

**Why not here:** The user engaged the question rather than deferring. The decision crystallized cleanly with two operational defenses — defer would have been correct if the picks felt forced, but Position C is genuinely the dominant option on the user's stated criteria (operational benefits without strategic commitment). Deferral now would re-litigate the same picks the next time the question surfaces.

## Failure mode

**Primary failure mode: backend internals leak through the SDK / shared-types boundary.**

The risk: a TypeScript type in `@bokchoy/shared-types` accidentally exposes an internal server shape (e.g., a wallet-balance computation that reveals the calculation formula; a debug field that names an internal table; an error code that leaks an internal-classification scheme). The leak ships to npm under MIT; once published, it cannot be un-published — competitors and adversaries have a permanent copy.

**Specifics on what could leak:**
- Field names on response shapes (`_internal_lock_version`, `system_account_id`, etc.) — leaks DB schema hints.
- Error code enums that include internal classifications (`SHARDING_BOUNDARY_VIOLATION`) — leaks operational topology.
- Idempotency-key derivation hints in JSDoc — leaks the server-side dedupe strategy.

**Probability:** medium. Without explicit boundary review discipline, accidental leakage at the package boundary is the default outcome over months of development.

## Mitigations

1. **`@bokchoy/shared-types` exports ONLY the public API contract.** No internal server types. The package is a manual extraction from the API surface, not a re-export of internal Drizzle row types. Code review discipline at the package boundary; CI lint that prohibits importing from `@bokchoy/db` / `@bokchoy/wallet` into `@bokchoy/shared-types`.

2. **SDK source review on every release.** Before publishing a new SDK version, review the diff for accidentally-shipped internal references (file paths in stack traces, internal env-var names in defaults, log-format strings that mirror server-side format strings). Stripe / Resend / Better Auth all have this discipline; it's the SDK-OSS standard.

3. **Trademark + brand protection.** Register "BokChoy" as a trademark before the SDKs ship publicly. Claim the `bokchoy` GitHub organization. Claim npm scope `@bokchoy` to prevent squatting. SDK README boilerplate identifies the repo as the "official" SDK; community forks must rename to avoid trademark infringement. Standard pattern.

4. **CVE-disclosure runbook.** Public SECURITY.md + `security@bokchoy.com` channel + 90-day responsible-disclosure window. When a CVE lands: assign CVE-ID via MITRE, draft public advisory, coordinate fix-ship-disclose timeline with reporter, publish GitHub Security Advisory. The first CVE is the one that tests the process; have the runbook drafted before the first SDK ships.

5. **DCO compliance check in CI.** GitHub Action that verifies `Signed-off-by:` line on every commit in every PR. Standard DCO bot pattern; minimal config.

6. **License-presence CI check.** Lint job in each OSS repo that verifies `LICENSE` file presence at root + correct content. Prevents the "someone deleted LICENSE" PR from merging.

## Idiom citations

N/A. This is a project-shape / licensing decision; not a stack-idiom decision. `idioms/typescript.md` doesn't speak to OSS/licensing concerns.

## Revisit when

Specific trigger conditions:

- **Customer demand for backend source access.** ≥3 prospects or customers explicitly ask *"can we audit the backend code?"* in sales conversations within a 6-month window. Revisit Position B with BSL/fair-source sub-fork as the candidate license model (preserves competitive defense while granting audit access). Track via sales-CRM tagging.
- **Compliance regime demands code escrow or source-available terms.** Government game-dev contract, gambling/regulated-currency regulator, or banking-tier customer pulls in escrow requirements. Revisit B with BSL or with formal code-escrow-via-third-party (Iron Mountain pattern) without changing public OSS status.
- **SDK contributor count exceeds 50 across the four SDKs.** Brand-protection load and contributor-governance overhead may justify upgrading DCO → CLA + appointing community maintainers. Re-evaluate at that scale.
- **Major customer in procurement requires Apache 2.0's explicit patent grant.** Some enterprise legal departments prefer Apache 2.0 because they've been burned by GPL-family confusion. Re-license MIT → Apache 2.0; requires contributor sign-off on the re-license. Manageable if contributor base is still small (<10 active).
- **A high-leverage acquisition or partnership requires closing the SDKs.** OSS → proprietary on the SDK side is hostile but recoverable (forks exist; the harm is reputational, not technical). Document the proposed transition path before committing; the close-later cost is real even at SDK scope.
- **The product class adds compliance-sensitive features (e.g., card-on-file storage, fiat off-ramp) that change the backend's CVE exposure profile.** Revisit whether SDK-OSS is still appropriate if SDK-level vulnerabilities become higher-severity than originally assumed.

## Cascade obligations

For implementation phase when the SDKs land:

1. **Trademark filing for "BokChoy"** before public GitHub org is populated.
2. **Claim `github.com/bokchoy` organization** + npm `@bokchoy` scope.
3. **Set up `@bokchoy/shared-types` package** in the monorepo — extract from `[[cockpit/admin-list-endpoints-contract]]`. Lint rule prohibiting cross-package imports from closed packages.
4. **Draft SECURITY.md template** + provision `security@bokchoy.com`.
5. **Set up DCO-check GitHub Action** in each OSS repo template.
6. **Draft LICENSE template** (MIT, standard SPDX text) + license-presence CI.
7. **SDK source-review runbook** for pre-release diff review.
8. **`[[marketing/landing-patterns-research]]` operational implication #8 (OSS-or-proprietary) is RESOLVED by this entry** — apex landing-page design can now apply F10's substitute strategy under the SDK-OSS framing. Open thread #2 in `[[marketing/oss-core-marketing-research]]` is CLOSED.
