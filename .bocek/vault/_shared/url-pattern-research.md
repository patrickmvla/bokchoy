---
type: research
features: [http-contract, backend-stack, wallet]
related: ["[[http-contract-research]]", "[[wrapper-shape]]", "[[wallet-mechanics]]", "[[backend-stack]]", "[[gaps]]"]
created: 2026-05-09
confidence: high
provisional: false
---

# When production REST APIs ship verb-heavy state-transition actions on identified resources, what URL pattern do they pin — and does the lock-out concern about coexisting nested-resource reads survive contact with production evidence?

## Question

Open from the GAP 9 /design pass on G1 (route shape). The /design seat enumerated three positions:

- (a) Stripe-style flat: `POST /v1/wallet/credit`
- (b) REST nested: `POST /v1/wallets/{walletId}/credits`
- (c) REST verb-slug under resource: `POST /v1/wallets/credit`

The /design self-attack on (a) raised: "When you ship `GET /v1/wallets/{walletId}` (read wallet balance) in a future slice, the URL hierarchy goes flat-action AND nested-resource coexisting." The /design mitigation: *"Stripe ships exactly this hybrid (`POST /v1/charges` + `GET /v1/customers/{id}`); the precedent holds."*

That mitigation was **production-cited × 1 by assertion**. The user pushed to /research rather than vault undefended reasoning. Question this entry resolves:

1. **Does Stripe actually ship pattern (a) as I claimed?** If not — what does Stripe actually ship for verb-heavy state-transition operations?
2. **Cross-system probe:** GitHub (the longest-running REST-purist API), Cal.com / Better Auth (TS-native cluster), Google AIP (Google's REST design spec).
3. **Counter-pattern probe:** does any major production API pick a uniform shape (no flat-action) and document why hybrid is wrong?

Anti-default declared: the loudest training-data answer is "REST = nouns only, no verbs in URIs." That's directly testable against production evidence — Stripe and GitHub both ship action verbs in URLs. The actual question is **where** the verb sits relative to the resource id.

## Triangulation

- **Production reference:** ✓ — Stripe (`stripe/stripe-node/src/resources/` directory tree at HEAD + `docs.stripe.com/api/charges/capture` URL pattern); GitHub (`docs.github.com/en/rest/pulls/pulls` action endpoints); Cal.com (`cal.com/docs/api-reference/v2/...` paths); Better Auth (`/api/auth/sign-in/email` paths cross-referenced via Hono integration docs).
- **Docs reference:** ✓ — Google AIP-136 *Custom Methods* (`google.aip.dev/136`, the canonical Google REST design spec for non-CRUD operations); GitHub REST docs.
- **Contradiction probe:** ✓ — actively searched for two contradictions: (a) "REST API verb path action vs resource production convention 2025/2026 hybrid" — surfaced industry guidance saying *"prioritize nouns over verbs in URIs"*. **Falsified by production at Stripe and GitHub** which both ship verbs as URL segments. (b) Cal.com / Better Auth ship verb-slug-as-segment patterns (`/v2/bookings/get-all-bookings`, `/api/auth/sign-in/email`) — but those are *collection-level* or *auth-method-level*, NOT *resource-id-scoped*. Different problem class from BokChoy's `walletCredit(walletId, ...)`.

## Sources examined

### Source 1 — `stripe/stripe-node` directory tree

- **Tier:** 1 (production code).
- **Provenance:** `github.com/stripe/stripe-node/tree/master/src/resources` at HEAD, observed 2026-05-09.
- **Author context:** Stripe staff engineering. ~10 years production. Real-money fintech multi-billion-dollar processing.
- **What it tells us:** Directory listing reveals the SDK's resource organization mirrors the URL hierarchy. Top-level resource files: `Charges.ts`, `Refunds.ts`, `PaymentIntents.ts`, `Customers.ts`, `Invoices.ts`, etc. — these map to flat `/v1/{resource}` paths for CRUD. Nested-relationship files: `CustomerSources.ts`, `CustomerCashBalanceTransactions.ts`, `CustomerBalanceTransactions.ts`, `FeeRefunds.ts` — these map to `/v1/{parent}/{id}/{child}` nested resource creation. **The tree confirms a hybrid: flat for top-level, nested for relationships.** But the action-verb-on-resource pattern (the BokChoy-relevant case) is not visible at directory level — actions live as methods on the resource files themselves.

### Source 2 — Stripe charges capture endpoint URL pattern

- **Tier:** 2 (official docs).
- **Provenance:** `docs.stripe.com/api/charges/capture`, observed 2026-05-09.
- **Author context:** Stripe API reference, version-pinned via `/v1/` prefix.
- **What it tells us:** **`POST /v1/charges/{CHARGE_ID}/capture`** — slash-suffix-verb on resource id. Capture is a path segment, NOT implied by HTTP method or by request-body discriminator. Same shape for: `POST /v1/charges/{CHARGE_ID}/refund`, `POST /v1/payment_intents/{INTENT_ID}/cancel`, `POST /v1/payment_intents/{INTENT_ID}/confirm`, `POST /v1/payment_methods/{METHOD_ID}/attach`, `POST /v1/invoices/{INVOICE_ID}/void`. **Production-cited × 5 named endpoints in the exact `POST /v1/{resource}/{id}/{verb}` shape.**

**This falsifies my /design (a) claim.** I had asserted Stripe ships `POST /v1/charges` flat-action for the capture operation; Stripe actually ships `POST /v1/charges/{id}/capture` resource-id-suffixed. /design mitigation by assertion is now corrected.

### Source 3 — GitHub REST API for pull requests

- **Tier:** 2 (official docs).
- **Provenance:** `docs.github.com/en/rest/pulls/pulls`, current as of 2026-05-09.
- **Author context:** GitHub. Longest-running REST-purist API in production (~15 years public).
- **What it tells us:** **Same slash-suffix-verb pattern as Stripe.** Endpoint paths:
  - `PUT /repos/{owner}/{repo}/pulls/{pull_number}/merge` — merge a PR
  - `PUT /repos/{owner}/{repo}/pulls/{pull_number}/archive` — archive a PR
  - `DELETE /repos/{owner}/{repo}/pulls/{pull_number}/archive` — unarchive
  - `PUT /repos/{owner}/{repo}/pulls/{pull_number}/update-branch` — sync with base
  - `GET /repos/{owner}/{repo}/pulls/{pull_number}/merge` — check if merged
  - Plus issue-level: `PUT /repos/{owner}/{repo}/issues/{issue_number}/lock`, `DELETE .../lock` (used for PR locking too — PRs are issue subtype)

All ship the **`{HTTP-verb} /{resource-tree}/{id}/{action-verb}`** shape. **Production-cited × 5 named endpoints.** Note the HTTP-verb-method use is principled — `PUT` for idempotent state transitions (merge, lock), `DELETE` for reversal (unlock, unarchive), `POST` for non-idempotent. BokChoy's wallet wrappers are non-idempotent at HTTP layer (idempotency is server-derived per `[[idempotency-strategy]]`) — `POST` is the right HTTP verb.

### Source 4 — Google AIP-136 Custom Methods

- **Tier:** 2 (spec / canonical reference).
- **Provenance:** `google.aip.dev/136`, the AIP framework Google publishes for its own and external REST APIs.
- **Author context:** Google's API design team. The AIP framework is what Google's external APIs (Cloud, Workspace, etc.) follow.
- **What it tells us:** Custom (non-CRUD) methods use the **colon-suffix** variant: `POST /v1/{name=publishers/*/books/*}:archive`, `POST /v1/{parent=publishers/*}/books:sort`, `POST /v1/{project=projects/*}:translateText`. Rationale verbatim: *"a custom method that operates on a resource or collection needs a `name` or `parent` parameter to indicate the resource that it operates on. This convention allows clients to map custom methods to the appropriate resource."* **Same intent as Stripe + GitHub (verb-on-resource), different separator (colon vs slash).** Production-cited via Google's external APIs; spec-cited as the authoritative Google convention.

### Source 5 — Cal.com API v2 + Better Auth (TS-native cluster contradiction probe)

- **Tier:** 2 (docs) for Cal.com, 1 (production code) for Better Auth via Hono integration docs.
- **Provenance:** `cal.com/docs/api-reference/v2/introduction` (paths surveyed in `[[http-contract-research]]` Source 6); Better Auth Hono integration shape in `hono.dev/examples/better-auth`.
- **Author context:** Cal.com (TS-native B2B SaaS, named-author production cite) and Better Auth (TS-native auth lib, BokChoy's adopted lib).
- **What it tells us:** Both ship **verb-slug-as-segment** but at *collection level* or *auth-method level*, NOT resource-id-scoped:
  - Cal.com: `/v2/bookings/get-all-bookings`, `/v2/event-types/create-an-event-type`, `/v2/platform-managed-users/create-a-managed-user`. Verb describes the operation on the collection; no specific id in path.
  - Better Auth: `/api/auth/sign-in/email`, `/api/auth/sign-up/email`, `/api/auth/sign-out`. Verb-as-segment is the auth-method discriminant — `email` is the *type* of sign-in, not a noun.
- **Different problem class from BokChoy's `walletCredit(walletId, ...)`.** Cal.com/Better Auth shapes apply to collection or method-type operations; BokChoy's wallet ops are resource-id-scoped (the wallet to operate on is named in the wrapper signature). The pattern doesn't generalize to BokChoy's case.

### Source 6 — General REST guidance (the contradiction probe)

- **Tier:** 4 (industry-aggregate engineering blogs and tutorials).
- **Provenance:** WebSearch query `"REST API" verb path action vs resource production convention 2025 OR 2026 hybrid pattern` — surfaced 10 results, all generic REST-best-practice articles.
- **Author context:** Aggregate; multiple blog publishers (Hevo, Strapi, Codebrand, Knowi, restfulapi.net).
- **What it tells us:** Strong consensus across these articles: *"Use nouns for resources and HTTP Methods (GET, POST, PUT, DELETE) for actions. URLs should represent resources (nouns), not actions (verbs). Nesting to one level is recommended."* **Production-falsified.** Stripe and GitHub both ship action verbs in URLs (Sources 2 + 3). The "nouns only" guidance is industry-prescription that production at scale doesn't follow when state-transition operations don't fit CRUD cleanly.

**Per Contradiction protocol** (production code wins over docs/blogs): production reality dominates. The "nouns only" prescription is a teaching simplification that doesn't survive contact with verb-heavy operations. **Confidence: high** that the prescription is over-broad.

## Findings

### F1 — `POST /v1/{resource}/{id}/{verb}` is the dominant production pattern for state-transition operations on identified resources

Production-cited × 2 ecosystems (Stripe + GitHub), 10+ named endpoints between them. Both at-scale APIs that have evolved over years; both handle non-CRUD operations on identified resources via slash-suffix-verb. Google AIP-136 ships the same intent with colon separator (a stylistic variant, not a different pattern).

**For BokChoy's wallet wrappers** (all four: `walletCredit`, `walletDebit`, `walletDeidentifyPlayer`, `bootstrapProjectReasonCodes`), this maps cleanly:

- `POST /v1/wallets/{walletId}/credit` (operates on wallet by id)
- `POST /v1/wallets/{walletId}/debit`
- `POST /v1/players/{playerId}/deidentify` (operates on player by id)
- `POST /v1/projects/{projectId}/bootstrap-reason-codes` (operates on project by id)

**Confidence: high.** Two independent ecosystems agree at production scale; the prescriptive contradiction (nouns-only) is falsified by the same production examples.

### F2 — The /design "lock-out" concern doesn't materialize under F1's pattern

The /design self-attack worried about future `GET /v1/wallets/{walletId}` (read wallet balance) coexisting with `POST /v1/wallet/credit` (flat-action). **Under F1's pattern, both endpoints share the same `/v1/wallets/{walletId}` resource prefix:**

- `GET /v1/wallets/{walletId}` → fetch wallet
- `POST /v1/wallets/{walletId}/credit` → execute credit on wallet
- `POST /v1/wallets/{walletId}/debit` → execute debit on wallet
- `GET /v1/wallets/{walletId}/transactions` → list transactions for wallet (future slice)

No hybrid coexistence problem. The hierarchy is uniform; verbs are leaves under their resource id. **The /design mitigation-by-assertion is replaced by direct production-cite.**

**Confidence: high.** This is what the production evidence is telling us with no ambiguity.

### F3 — The lock-out worry would only materialize under (a) flat-action `POST /v1/wallet/credit` (no resource id in path) — which production reality doesn't ship

(a) was my /design pick. **It's wrong.** Stripe doesn't ship `POST /v1/charges/capture` (no charge id); it ships `POST /v1/charges/{id}/capture`. Same for GitHub. The flat-action shape would be the lock-out failure mode, but no production API at scale picks it for resource-id-scoped operations. The case for (a) was based on my misreading of Stripe's pattern — corrected by Source 2.

**Confidence: high.**

### F4 — Body field casing is orthogonal to URL pattern; the prior research entry's snake-vs-camel decision still stands

`[[http-contract-research]]` F1 surfaced snake_case (Stripe) vs camelCase (Better Auth / TS-native default) vs PascalCase (PlayFab Microsoft-stack) — three production patterns at the body-field level. **This entry's URL-pattern finding doesn't constrain the body-casing pick.** A `POST /v1/wallets/{walletId}/credit` endpoint can ship `{ "amount": 100, "currency_id": "..." }` (snake) or `{ "amount": 100, "currencyId": "..." }` (camel). Two independent decisions; /design picks both separately.

## Conflicts

### Conflict 1 — "Use nouns, not verbs in URIs" (industry-prescription) vs Stripe + GitHub action verbs in URLs (production reality)

Per Contradiction protocol (production code wins over docs/blogs / multiple independent production examples beat one): production wins. Industry blogs are over-prescriptive — they teach the simplified case (CRUD on nouns) and don't acknowledge that verb-heavy state transitions get verbs-in-URLs at every major API at production scale.

**Conditions:** the nouns-only prescription is correct for pure-CRUD APIs (e.g., a standard `users` collection where every operation is create/read/update/delete). It breaks down for APIs with state-transition verbs (capture, refund, merge, lock, attach, void) — those need URL representation either via slash-suffix (Stripe/GitHub), colon-suffix (Google AIP), or some equivalent.

**Not artificially resolved.** The conflict is itself the finding: industry guidance lags production reality at scale.

### Conflict 2 — Stripe slash-suffix vs Google AIP colon-suffix

Both ship verb-on-resource. Stripe: `/{id}/{verb}`. Google: `/{id}:{verb}`. Cosmetic difference; same architectural intent.

**Per Contradiction protocol** (multiple independent production examples beat one): Stripe + GitHub use slash (production cite × 2); Google uses colon (production cite × 1, Google APIs). **Slash dominates by ecosystem count.**

**Conditions:** the colon-suffix pattern's stated rationale is *"clearly distinguishes custom operations from standard CRUD methods."* That distinction matters in API frameworks where custom methods are a separate class from CRUD; less so in REST-flat APIs where everything is just an HTTP verb on a path.

For BokChoy: slash-suffix matches Stripe + GitHub conventions, both more familiar to TS-native engineers than Google AIP. **No specific reason to deviate.** Pick slash.

## Conditions

These findings hold under:

- **API style:** REST/HTTP. Not GraphQL (where the URL pattern question is moot — single endpoint, query/mutation discriminant in body), not gRPC, not JSON-RPC.
- **Operation class:** state-transition actions on identified resources (capture, refund, credit, debit, merge, lock, etc.). For pure CRUD on collections, the "nouns only" prescription is correct.
- **Time:** 2026-Q2. Stripe + GitHub patterns have been stable for years; no signal of either deprecating the slash-suffix-verb pattern.

Revisit if:
- **A major TS-native API publishes a different convention** with explicit production-cited rationale. Cal.com or Better Auth pivoting from collection-level verb-slug to a different shape would be a signal.
- **Google AIP-136 colon-suffix gains adoption outside Google.** Currently Google-internal + their external APIs; no significant cross-ecosystem adoption surveyed.
- **BokChoy's API style shifts** (e.g., adopts GraphQL or tRPC). URL-pattern question becomes moot.

## Operational implications

For BokChoy GAP 9 G1 resolution and the broader `[[wallet-http-contract]]` (or `[[backend-http-contract]]`) /design pass:

### Recommended URL pattern

`POST /v1/{resource-collection}/{id}/{verb}` for resource-id-scoped state-transition actions.

For BokChoy's wallet wrappers specifically:

| Wrapper | URL |
|---|---|
| `walletCredit(db, { walletId, ... })` | `POST /v1/wallets/{walletId}/credit` |
| `walletDebit(db, { walletId, ... })` | `POST /v1/wallets/{walletId}/debit` |
| `walletDeidentifyPlayer(db, { playerId })` | `POST /v1/players/{playerId}/deidentify` |
| `bootstrapProjectReasonCodes(db, { projectId })` | `POST /v1/projects/{projectId}/bootstrap-reason-codes` |

Slice 8.1 ships `POST /v1/wallets/{walletId}/credit` (and probably `/debit` too — same shape, trivial second handler). The other two wrappers are different auth surfaces and slip to later slices per `[[gaps]]` GAP 9 G3 resolution.

### What this resolves vs leaves open

**Resolved:** G1 path/method picks. URL pattern lifts cleanly from production cites; lock-out concern from /design self-attack does not materialize (F2). Fourth pattern (d) — which I missed in /design — is the production-cited answer.

**Still open after this entry:**
- **Plural vs singular collection name** (`/v1/wallets/{id}/credit` plural vs `/v1/wallet/{id}/credit` singular). Stripe + GitHub both use plural collection names — `/charges`, `/payment_intents`, `/repos/{owner}/{repo}/pulls/{number}`. **Plural wins** by production-cite × 2. Pin in /design vault entry.
- **Hyphenated multi-word verbs** (`bootstrap-reason-codes` vs `bootstrapReasonCodes` vs `bootstrap_reason_codes`). GitHub uses hyphenated (`/update-branch`, `/dismissals`). Stripe single-word verbs (`capture`, `cancel`, `attach`). Hyphenated is the GitHub convention for multi-word verbs — defensible at /design.
- **Body field casing** (snake vs camel) — orthogonal per F4. `[[http-contract-research]]` F1's analysis still stands; /design picks separately.

### Cascade for /design

The `[[wallet-http-contract]]` (or broader) entry should pin:

1. URL pattern: `POST /v1/{resource-plural}/{id}/{verb}` for resource-id-scoped state-transition actions, slash-suffix-verb. Production-cited × 2 (Stripe + GitHub). Confidence: high.
2. Plural collection names. Production-cited × 2.
3. Verb naming for multi-word: hyphenated kebab-case. GitHub-cited.
4. Future endpoint shapes:
   - `GET /v1/wallets/{walletId}` for balance reads — clean composition.
   - `GET /v1/wallets/{walletId}/transactions` for transaction history — nested-resource list.
   - The hybrid worry doesn't materialize because both endpoints share the resource prefix.

## Reproducibility note

Reproducible. All sources are public web URLs and public GitHub repos. Search queries recorded inline. Tools: `gh api` for GitHub source/issues, `WebFetch` for docs, `WebSearch` for the contradiction probe.

The judgment that survives reproduction:
- Stripe ships `POST /v1/charges/{id}/capture` slash-suffix-verb — verifiable at `docs.stripe.com/api/charges/capture`.
- GitHub ships `PUT /repos/{owner}/{repo}/pulls/{number}/merge` — verifiable at `docs.github.com/en/rest/pulls/pulls`.
- The "nouns only" prescription is industry-aggregate guidance; production at scale doesn't follow it for state-transition operations — verifiable by re-running the search.

The judgment that does NOT reproduce mechanically:
- "Slash-suffix wins over colon-suffix because Stripe + GitHub > Google AIP" — counts ecosystems, ignores the depth of Google's API surface. Another investigator might weight Google AIP more heavily. Documented for /design.
- "Cal.com / Better Auth verb-slug at collection level is a 'different problem class' than BokChoy's resource-id-scoped operations" — judgment about whether the patterns are interchangeable. Documented inline.

## Open threads

- **Stripe API surface enumeration.** This entry samples 5+5 named endpoints. Full enumeration of Stripe's action endpoints (`stripe-node/src/resources/*.ts` line-grep on `path:`) would strengthen the production-cite × 2 from "5+ examples" to "the entire production API surface follows the pattern." Marginal value for /design; do at /implementation if the pattern is challenged later.
- **Plural-vs-singular collection naming for the BokChoy-specific case.** Stripe + GitHub use plural; recommendation is plural. /design owns the final pick.
- **Multi-word verb conventions across more APIs.** GitHub kebab-case (`update-branch`); Google AIP camelCase via colon (`:translateText`); Stripe avoids multi-word verbs. /design picks based on body-casing decision (kebab-in-URL pairs naturally with snake-in-body; camelCase-in-URL pairs with camel-in-body).
- **`POST` vs `PUT` for state-transition actions.** Stripe uses POST throughout; GitHub uses PUT for idempotent transitions (merge, lock — the result is the same on repeat). BokChoy's wallet ops are non-idempotent at HTTP layer (idempotency is server-derived per `[[idempotency-strategy]]`); `POST` matches Stripe + the actual semantic. Open thread: re-evaluate if a future endpoint adds genuine HTTP-layer idempotency (rare).
