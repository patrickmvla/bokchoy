---
type: research
features: [wallet, backend-stack, http-contract]
related: ["[[wallet-mechanics]]", "[[wrapper-shape]]", "[[backend-stack]]", "[[backend-service-shape]]", "[[idempotency-strategy]]", "[[player-auth]]", "[[gaps]]"]
created: 2026-05-09
confidence: high
provisional: false
---

# How do production HTTP APIs in the TS-native + game-backend cluster shape their wallet/transaction-style endpoints — route + body casing + validator + error response?

## Question

For BokChoy's first wallet HTTP handler (`apps/backend/src/wallet/index.ts`, slice 8.1, blocked behind `[[gaps]]` GAP 9), three subdecisions cluster on the same source-walk:

- **G1 (route shape)** — path scheme (flat resource vs nested vs RPC vs verb-noun-slug), HTTP method, body field casing (snake / camel / Pascal), response envelope (top-level vs `data` wrapped vs `{object: ..., id, ...}`), API version prefix.
- **G2 (validator)** — Zod, Valibot, or Standard Schema with Hono in 2026-Q2.
- **G3 (error response body)** — Stripe-shape wrapped vs flat top-level vs RFC 9457 problem+json vs JSON-RPC framing.

Triangulation against (a) the canonical real-money fintech reference (Stripe), (b) TS-native B2B SaaS production users (Cal.com, Better Auth ecosystem), (c) two F2P game-backend references (PlayFab Economy v2, LootLocker), (d) one TS-native RPC-style framework as contradiction probe (tRPC), (e) the IETF spec (RFC 9457), (f) the validator-spec interop layer (Standard Schema).

## Triangulation

- **Production reference:** ✓ — Stripe (`stripe/stripe-node` SDK + Stripe API docs), Better Auth (`better-auth/better-auth` + `bekacru/better-call` SDK source), Cal.com API v2 (docs + public error format), PlayFab Economy v2 (`Inventory/AddInventoryItems` REST endpoint), LootLocker (game backend, partial — auth header + path scheme only), tRPC (docs source-walk).
- **Docs reference:** ✓ — `docs.stripe.com/api/charges/create`, `docs.stripe.com/api/errors`, `hono.dev/docs/guides/validation`, `hono.dev/docs/api/exception`, `trpc.io/docs/server/error-handling`, `learn.microsoft.com/en-us/rest/api/playfab/economy/inventory/add-inventory-items` (PlayFab Economy v2, observed 2026-04-28), `datatracker.ietf.org/doc/html/rfc9457` (Problem Details for HTTP APIs, July 2023, obsoletes RFC 7807), `standardschema.dev` + `github.com/standard-schema/standard-schema` (v1.1.0 released 2025-12-15).
- **Contradiction probe:** ✓ — actively searched for two contradictions: (a) RFC 9457 production adoption in TS-native ecosystem (`"application/problem+json" production API 2025 OR 2026 TypeScript Node.js`) — surfaced **no major TS-native production API** adopting problem+json as default error shape; (b) F2P backend convention vs B2B SaaS convention (PlayFab + LootLocker vs Stripe + Cal.com + Better Auth) — surfaced real divergence: PlayFab uses RPC-style PascalCase paths with body-field idempotency IDs; F2P generally trends RPC-flavored where B2B SaaS trends REST-flat-resource. Plus a third contradiction surfaced unbidden: TS-native ecosystem itself is split between **Stripe-wrapped** (Stripe + Cal.com) and **flat top-level** (Better Auth + better-call) error body shapes.

## Sources examined

### Source 1 — Stripe Node SDK error class hierarchy

- **Tier:** 1 (production code).
- **Provenance:** `github.com/stripe/stripe-node`, `src/Error.ts` at HEAD `main` branch, observed 2026-05-09 via raw GitHub content.
- **Author context:** Stripe staff engineering. Shipping for ~10 years. Production scale: real-money fintech at multi-billion-dollar processing volume. **Caveat:** real-money context, not F2P game economy.
- **What it tells us:** `StripeError` base class with fields `{message, type, code, raw, rawType, headers, requestId, statusCode, doc_url, param, decline_code, charge, payment_method_type}` plus a hierarchy of ~12 subclasses (`StripeCardError`, `StripeAPIError`, `StripeIdempotencyError`, `StripeInvalidRequestError`, `StripeRateLimitError`, etc.). Constructor takes a pre-parsed `StripeRawError` — confirms wire envelope `{ error: { type, code, message, ... } }` is parsed once into `raw`/`rawType` then dispatched to subclass via `generateV1Error()`/`generateV2Error()`.

### Source 2 — Stripe `POST /v1/charges` API doc

- **Tier:** 2 (official docs).
- **Provenance:** `docs.stripe.com/api/charges/create`, current as of 2026-05-09.
- **Author context:** Stripe API reference, version-pinned via `/v1/` prefix in URL.
- **What it tells us:** path is flat-resource `POST /v1/charges`. Body fields are **snake_case** (`amount`, `currency`, `source`, `application_fee_amount`, `statement_descriptor_suffix`). Response is the resource object at top level with `{id, object: 'charge', amount, ...}` shape — **no `data` envelope wrapping**. `Idempotency-Key` is a header (not body field). Auth via `Authorization: Bearer <secret>` (Basic auth shown via `-u` flag is a CLI-syntax form of Bearer).

### Source 3 — Stripe error object reference

- **Tier:** 2 (official docs).
- **Provenance:** `docs.stripe.com/api/errors`, current as of 2026-05-09.
- **Author context:** Stripe API reference.
- **What it tells us:** error object fields: `{type (enum required), code (nullable), message (nullable), param (nullable), charge (nullable), decline_code (nullable), advice_code (nullable), network_decline_code (nullable), network_advice_code (nullable), doc_url (nullable), request_log_url (nullable), payment_intent (object nullable), payment_method (object nullable), payment_method_type (string nullable), setup_intent (object nullable), source (object nullable)}`. Type enum: `api_error | card_error | idempotency_error | invalid_request_error`. HTTP→type mapping: 400→invalid_request_error, 401→api_error, 402→card_error, 403→api_error, 404→api_error, **409→idempotency_error**, 424→api_error, 429→api_error, 5xx→api_error. (The `409→idempotency_error` mapping is direct precedent for BokChoy's BC001 IdempotencyKeyInUse.) The doc page lists fields under "Attributes" of "the error object" — wire envelope `{ error: { ... } }` is heavily implied (and confirmed by the SDK's `StripeRawError` parsing path in Source 1).

### Source 4 — better-call `APIError` class (Better Auth's underlying HTTP lib)

- **Tier:** 1 (production code).
- **Provenance:** `github.com/bekacru/better-call`, `packages/better-call/src/error.ts` at HEAD `main` branch, observed 2026-05-09.
- **Author context:** bekacru is the Better Auth founder; better-call is the HTTP lib better-auth was extracted from. Better Auth itself: YC X25, v1.5.0 (2026-03-01), 600+ commits, named-author production cite. Production scale: Cal.com, Deel.com, dough.ink, MeetingBaas (per `[[backend-stack]]`).
- **What it tells us:** `class InternalAPIError extends Error` with constructor `(status, body, headers, statusCode)`. `body` is typed as `{ message?: string; code?: string; cause?: unknown } & Record<string, any>` — **flat top-level fields, no `error` wrapper**. `ValidationError extends InternalAPIError` emits `{ message, code: 'VALIDATION_ERROR' }` body with status 400 and carries `issues: readonly StandardSchemaV1.Issue[]` on the JS side (kept off the wire by default). `statusCodes` enum exposes named keys for all standard HTTP statuses including the wallet-relevant ones (`409 CONFLICT`, `422 UNPROCESSABLE_ENTITY`). **The lib speaks Standard Schema natively** — `ValidationError` takes `StandardSchemaV1.Issue[]`, validates against `StandardSchemaV1` shapes, no library-specific (Zod/Valibot/ArkType) coupling.

### Source 5 — Better Auth `APIError` re-export

- **Tier:** 1 (production code).
- **Provenance:** `github.com/better-auth/better-auth`, `packages/core/src/error/index.ts` at HEAD `main`, observed 2026-05-09.
- **Author context:** Better Auth core package; same ecosystem as Source 4.
- **What it tells us:** Better Auth re-exports better-call's `APIError` directly. Static factories `APIError.fromStatus(status, body)` and `APIError.from(status, { code, message })` — the second factory shows the canonical wire body shape: `{ message: error.message, code: error.code }`, **flat top-level**.

### Source 6 — Cal.com API v2 introduction + error response

- **Tier:** 2 (docs) + 4 (engineering blog excerpt for the error format).
- **Provenance:** `cal.com/docs/api-reference/v2/introduction` (introduction page, observed 2026-05-09); error format quoted in DeployHQ Hono guide article search result.
- **Author context:** Cal.com (TS-native B2B SaaS, named in `[[backend-stack-research]]` Sources 8/9 as a Better Auth + Hono ecosystem production user). Indie/SMB scale.
- **What it tells us:** REST-style versioned paths `/v2/oauth`, `/v2/platform-managed-users/create-a-managed-user`, `/v2/bookings/get-all-bookings`, `/v2/event-types/create-an-event-type` — **verb-noun-slug under resource** ("get-all-bookings" not pure REST `GET /bookings`). Auth: `Authorization: Bearer <api-key>` standard, plus platform OAuth via `x-cal-client-id` + `x-cal-secret-key`. Rate-limit error body: `{ "error": { "code": "too_many_requests", "message": "Rate limit exceeded" } }` — **Stripe-shape wrapped under `error` key**. (Same lineage diverges in body shape from Better Auth despite being in adjacent ecosystem; see *Conflicts* below.)

### Source 7 — Hono validation guide + HTTPException docs

- **Tier:** 2 (official docs).
- **Provenance:** `hono.dev/docs/guides/validation`, `hono.dev/docs/api/exception`, observed 2026-05-09.
- **Author context:** Hono framework docs. v4.x.
- **What it tells us:** Hono itself imposes **no error body shape** — `HTTPException(status, { message?, res?, cause? })`, `getResponse()` returns Response with `text` body by default. JSON shape is developer-defined. `app.onError` checks `instanceof HTTPException`, calls `getResponse()`, falls back to generic 500. Validation middleware: `@hono/zod-validator` AND `@hono/standard-validator` both shipped from `honojs/middleware` org — **community packages from the official org, neither labeled "official"**. Standard Schema explicitly supported via the standard-validator middleware; works with Zod, Valibot, ArkType natively (via their Standard Schema interfaces). No "preferred" pick named in Hono's own docs.

### Source 8 — tRPC error handling (TS-native RPC-style contradiction probe)

- **Tier:** 2 (official docs).
- **Provenance:** `trpc.io/docs/server/error-handling`, current as of 2026-05-09.
- **Author context:** tRPC framework. Adopted by Cal.com (per Source 6 ecosystem) and many TS-native shops.
- **What it tells us:** `TRPCError(code, message, cause)`. Code enum maps to HTTP status (`BAD_REQUEST`→400, `UNAUTHORIZED`→401, `CONFLICT`→409, `UNPROCESSABLE_CONTENT`→422, `INTERNAL_SERVER_ERROR`→500, etc.). Wire format is **JSON-RPC 2.0** — `{ "id": null, "error": { "message": "...", "code": -32600, "data": { "code": "ERROR_CODE", "httpStatus": 400, "stack": "...", "path": "procedure.path" } } }`. Different shape from REST-style. Rules out for BokChoy because BokChoy is REST-style by `[[backend-stack]]` Hono+REST commitment, but informative as a TS-native data point.

### Source 9 — PlayFab Economy v2 `Inventory/AddInventoryItems`

- **Tier:** 2 (official docs).
- **Provenance:** `learn.microsoft.com/en-us/rest/api/playfab/economy/inventory/add-inventory-items`, last updated 2026-04-28, API version 260424.
- **Author context:** Microsoft PlayFab — largest game-backend reference. F2P-context.
- **What it tells us:** path `POST https://[titleId].playfabapi.com/Inventory/AddInventoryItems` — **RPC-style flat path** with `{Service}/{ActionName}` PascalCase. Request body fields: **PascalCase** (`Amount`, `CollectionId`, `CustomTags`, `DurationInSeconds`, `ETag`, `Entity`, `IdempotencyId`, `Item`, `NewStackValues`). **`IdempotencyId` lives in the request body, not a header** — divergent from Stripe. Response: top-level resource object (no `data` envelope), e.g. `AddInventoryItemsResponse { ETag, IdempotencyId, TransactionIds }`. Error wrapper: `ApiErrorWrapper { code: integer (HTTP), error: string (PlayFab code), errorCode: integer (PlayFab numeric), errorDetails: object, errorMessage: string, status: string (HTTP) }` — **multi-field wrapper, lowercase**, completely different shape from Stripe-style. Auth: `X-EntityToken` header.

### Source 10 — LootLocker game backend (partial)

- **Tier:** 4 (engineering blog / docs index).
- **Provenance:** `docs.lootlocker.com/llms-full.txt`, observed 2026-05-09 (canonical API reference URL 404d; index used as fallback).
- **Author context:** LootLocker, F2P backend. Smaller than PlayFab; named in `[[economy-primitives-research]]`.
- **What it tells us:** path scheme is role-segmented — `https://api.lootlocker.io/game/player/...` for player API, separate `https://ref.lootlocker.com/game | /server | /admin` reference roots. Auth: `x-session-token` header. Field naming: snake_case per quoted fields (`player_ulid`, `player_id`, `public_dependency_module_names`). **Limited evidence for body shape and error shape** — the doc-index page didn't surface them. Treat as one weak signal corroborating the F2P snake_case convention; not load-bearing.

### Source 11 — RFC 9457 Problem Details for HTTP APIs

- **Tier:** 2 (IETF spec).
- **Provenance:** `datatracker.ietf.org/doc/html/rfc9457`, published July 2023, Standards Track / Proposed Standard. **Obsoletes RFC 7807.**
- **Author context:** IETF working group. Spec-cited, not production-cited at this tier.
- **What it tells us:** required JSON members `{type, title, status, detail, instance}`. `Content-Type: application/problem+json`. Extension members permitted. **Successor to RFC 7807** (which the gap report mistakenly cited; corrected here).

### Source 12 — Standard Schema spec

- **Tier:** 2 (spec) + 1 (production code, the spec repo itself).
- **Provenance:** `github.com/standard-schema/standard-schema`, README + spec source, v1.1.0 released 2025-12-15. 3.5k stars, 13 releases, 498 commits.
- **Author context:** Three named authors collaboratively maintaining the spec — Colin McDonnell (Zod), Fabian Hiller (Valibot), David Blass (ArkType). All three TS-validator authors agreed on the spec — the ecosystem-defining cite.
- **What it tells us:** v1 spec stable. Three interfaces: `StandardTypedV1`, `StandardSchemaV1`, `StandardJSONSchemaV1`. Schema lib publishes a `~standard` property (version, vendor, types) and `validate(input)` returning `{ value }` or `{ issues: ReadonlyArray<Issue> }` where `Issue: { message, path? }`. Available at `@standard-schema/spec` on npm/JSR. **Better-call (Source 4) consumes `StandardSchemaV1.Issue` natively** — the lib BokChoy will adopt for auth speaks Standard Schema.

### Source 13 — RFC 9457 production adoption probe (negative result)

- **Tier:** 4 (web search, negative result).
- **Provenance:** WebSearch query `"application/problem+json" production API 2025 OR 2026 TypeScript Node.js adoption`, run 2026-05-09.
- **Author context:** Aggregate web search.
- **What it tells us:** **no major TS-native production API surfaces in the result set** as a problem+json adopter. Many production-Node tutorials surface (Express + tsc patterns); none cite `application/problem+json` as their default error shape. The recommended pattern across surveyed TS production guidance is "create an HttpException class" — flat custom shape. **Inference: RFC 9457 is spec-cited but ecosystem-divergent in the TS-native cluster.** Caveat: negative web-search results are weaker than positive cites; the absence may reflect search-engine ranking, not actual non-adoption. Conservative reading: at minimum, problem+json is not the dominant pattern in the TS-native cluster relevant to BokChoy.

## Findings

### F1 (G1) — Two divergent path conventions: REST flat-resource (B2B SaaS) vs RPC-flavored (F2P game backends)

Two stable patterns, picked for different reasons:

**Pattern A — REST flat-resource with `/v{N}/...` prefix.** Stripe (`POST /v1/charges`), Cal.com (`POST /v2/bookings/get-all-bookings` with verb-slug-under-resource style — a softened-REST hybrid), tRPC (which abandons it for JSON-RPC, but is the outlier). Resource at top level, action implicit in HTTP verb (Stripe: `POST` creates) or explicit-but-slugged (Cal.com: `/get-all-bookings`).

**Pattern B — RPC-style `/{Service}/{ActionName}`.** PlayFab Economy v2 (`POST /Inventory/AddInventoryItems`), LootLocker (role-segmented variant). Action is explicit in path; HTTP verb is uniformly POST.

**Body field casing:** Stripe and most B2B SaaS use snake_case at the wire boundary; PlayFab uses PascalCase; Better Auth / better-call use camelCase (the JS-native default — they don't transform); LootLocker uses snake_case.

**Response envelope:** Stripe + PlayFab + Better Auth all return the resource at top level with no `data` wrapper — `{id, object: 'charge', amount, ...}` shape. (Stripe adds an `object` discriminant field; PlayFab and Better Auth return the resource directly.) The `{ data: {...} }` envelope pattern (JSON:API spec, Hasura, etc.) is **not present** in any surveyed TS-native or F2P production API. Confidence: high.

**Idempotency placement:** Stripe puts `Idempotency-Key` in the **header**; PlayFab puts `IdempotencyId` in the **body**. Per `[[idempotency-strategy]]` BokChoy already commits to header (Stripe-shape), so the F2P body-field convention is informative but ruled out.

### F2 (G2) — Standard Schema is the validator-neutral interop layer; Hono ships first-class middleware for it

Standard Schema v1.1.0 (December 2025) is co-authored by the three biggest TS validator maintainers (Zod, Valibot, ArkType). Hono's `@hono/standard-validator` accepts any Standard Schema-compliant validator. Better Auth's underlying HTTP lib (`better-call`) consumes `StandardSchemaV1.Issue` natively for its `ValidationError`. The TS ecosystem trajectory is **validator-neutrality at the API boundary**, which means:

- Zod-via-`@hono/zod-validator` and Standard-Schema-via-`@hono/standard-validator` are both first-class options in Hono.
- Choosing Standard Schema doesn't lock out Zod — Zod (4.x) ships a Standard Schema interface; using `@hono/standard-validator` with a Zod schema works.
- Choosing `@hono/zod-validator` directly couples middleware to Zod specifically; switching validators later requires touching every route's middleware (small but real cost).

Confidence: high on the spec maturity (3.5k stars, 13 releases, jointly authored). Medium on the production-adoption-rate-curve — the search did not surface specific named production users beyond Better Auth (via better-call) and the validator-author libs themselves. **Open thread:** which version of Zod / Valibot / ArkType ships native Standard Schema support? (Worth confirming at /design when picking the catalog version.)

### F3 (G3) — TS-native ecosystem is split between Stripe-wrapped and flat-top-level error body shapes; RFC 9457 has minimal TS-native production adoption

Three concrete patterns surveyed:

**Pattern X — Stripe-wrapped:** `{ "error": { "code", "message", ...other fields } }`. Cited by Stripe (the canonical fintech API) + Cal.com (TS-native B2B SaaS, Hono-using ecosystem). Rationale: SDK ergonomics — every Stripe-language SDK destructures `body.error` once, dispatches by `error.type`/`error.code`. Production-cite × 2.

**Pattern Y — Flat top-level:** `{ "code", "message", ...other fields }`. Cited by Better Auth (and its underlying `better-call` lib) — both authored by the same engineer, but architecturally distinct: better-call's `APIError(status, body)` is the lower-level primitive that Better Auth and any other better-call consumer would emit. Rationale: simpler to construct (`throw new APIError(409, { code: 'BC001', message: '...' })` skips one nested object); HTTP status code already carries the "this is an error" signal — wrapping under `error` is ceremony. Production-cite × 2 (Better Auth + better-call, but one ecosystem).

**Pattern Z — RFC 9457 problem+json:** `{ "type", "title", "status", "detail", "instance" }` + `application/problem+json`. IETF Standards Track, July 2023, obsoletes 7807. **No major TS-native production API surfaced** in adoption probe.

**Pattern W — JSON-RPC framed:** tRPC. Different protocol entirely; ruled out for REST handlers.

**Pattern V — F2P multi-field wrapper:** PlayFab `ApiErrorWrapper { code, error, errorCode, errorDetails, errorMessage, status }`. Verbose, six fields where Stripe uses three. Confidence: high on F2P-domain adoption, low on cross-domain applicability (PlayFab is the F2P reference point but the wrapper shape isn't widely emulated outside Microsoft's API surfaces).

Stripe-wrapped (X) and flat-top-level (Y) are tied at 2 production cites each. The contradiction is real.

## Conflicts

### Conflict 1 — Stripe-wrapped (X) vs flat-top-level (Y) error body shape

**The disagreement.** Stripe + Cal.com (real-money fintech + TS-native B2B SaaS) emit `{ error: { ... } }`. Better Auth + better-call (TS-native auth lib + its underlying HTTP lib) emit `{ ... }` flat. Both are Production-cite × 2.

**Per *Contradiction protocol* (production code wins; multiple independent production examples beat one):**

- (X) Stripe-wrapped: production is **Stripe** (largest API surface in the surveyed cluster) plus Cal.com. **Two independent ecosystems** (real-money fintech + TS-native B2B SaaS, the latter using Better Auth itself but emitting Stripe-shape at its API boundary).
- (Y) Flat top-level: production is **Better Auth + better-call**, which is **one ecosystem** (both authored by bekacru, both in the same dependency graph). Stronger as a cite for "the lib BokChoy is adopting picks Y" — weaker as a "two independent production users picked Y" claim.

By cross-ecosystem-independence count, (X) wins: 2 ecosystems vs 1. By "Better Auth, BokChoy's actual auth lib" relevance, (Y) is the most-aligned-with-our-stack pick. The disagreement is genuine.

**Conditions under which each side wins:**

- (X) wins when: SDK ergonomics matter (planning a typed SDK across multiple languages where uniform `error.code` dispatch is high-value); the API is shipped to external integrators who use SDK conventions to dispatch.
- (Y) wins when: HTTP status code is the primary "this is an error" signal and the body just carries diagnostic detail; the API is shipped to internal consumers who don't need cross-language SDK uniformity.

**Not artificially resolved.** /design picks based on whether BokChoy's Month 4+ SDK aspiration warrants Stripe-shape ergonomics, or whether internal-developer-ergonomic flat-shape (consistent with Better Auth's own emission pattern) wins.

### Conflict 2 — REST flat-resource (Pattern A) vs RPC-style (Pattern B) path scheme

**The disagreement.** B2B SaaS (Stripe + Cal.com + Better Auth) uses REST flat-resource with `/v{N}/{resource}` prefix. F2P game backends (PlayFab + LootLocker) use RPC-style `/{Service}/{ActionName}`.

**Per *Contradiction protocol* (multiple independent production examples beat one):**

- (A) REST: production is Stripe + Cal.com + Better Auth (3 ecosystems, all tier-1 sources). Cross-domain.
- (B) RPC-style: production is PlayFab + LootLocker (2 F2P-domain references, both game-backend-specific).

Cross-domain (A) outweighs domain-specific (B). However, **BokChoy is a game backend** — the F2P-domain cite is more domain-aligned even if numerically smaller.

**Conditions:**

- (A) REST wins when: the team values cross-API uniformity (Stripe-style developer experience), the action set per resource is small (CRUD plus a few verbs), the HTTP-method semantics carry meaning (`GET`/`POST`/`DELETE` mapped naturally).
- (B) RPC wins when: actions don't fit CRUD cleanly (game backends have `Inventory/AddInventoryItems`, `Player/GrantToken`, `Wallet/CreditCurrency` — verb-heavy); discoverability via path-scan is valued; HTTP-method mapping doesn't carry signal (everything is POST anyway).

BokChoy's wallet wrappers — `walletCredit / walletDebit / walletDeidentifyPlayer / bootstrapProjectReasonCodes` — **are verb-heavy and don't fit CRUD cleanly**. The wallet "resource" (a row in `wallets`) doesn't mutate via `POST /wallets`; it mutates via a stored function that the wrapper delegates to. So at the wire boundary, BokChoy is **structurally closer to F2P RPC** than to Stripe REST, despite the team's TS-native B2B SaaS lineage. Not a resolution — flagging the structural tension for /design.

### Conflict 3 — Body field casing: snake (Stripe) vs camel (Better Auth) vs Pascal (PlayFab)

Three production patterns. The TS-native ecosystem itself is split: Stripe (snake) is the canonical reference but Better Auth / Hono / tRPC / most TS-native APIs default to **camel** because TS object literals are camelCase natively and case-transformation at the wire boundary is friction. Stripe transforms; most TS-native APIs don't.

**Per *Contradiction protocol*:** production-code count is roughly tied — Stripe (snake, real-money fintech) vs everyone-else-TS-native (camel) vs PlayFab (Pascal, game-backend Microsoft-stack). The contradiction is: do you transform at the wire boundary to match a reference convention (Stripe), or pass through your stack's native casing (TS-native default).

**Conditions:**

- snake_case wins when: the API is meant to be language-agnostic and consumed by SDKs in multiple languages (Stripe ships SDKs in Ruby/Python/Go/Java/PHP/.NET — snake matches Ruby/Python/Go conventions and is consistent across them).
- camelCase wins when: TS is the primary or only intended consumer, and the team values lossless TS-↔-wire mapping (no transformation layer).
- PascalCase wins when: integrating with a Microsoft / .NET-flavored ecosystem where PascalCase is canonical.

BokChoy's SDK aspiration is named in `[[wallet-mechanics]]` and `[[idempotency-strategy]]` (TS SDK auto-key generation); the SDK ships TS-first. camelCase aligns with TS-first SDK shipping. snake_case aligns with "Stripe-shape end-to-end including wire."

## Conditions

These findings hold under:

- **API boundary**: HTTP/REST. Not WebSockets, not gRPC. (BokChoy commits to REST per `[[backend-stack]]` Hono.)
- **Stack**: TS-native (Bun + Hono + postgres-js + Better Auth + Drizzle). Findings would shift if BokChoy were Go (Stripe-Go, Gin patterns differ slightly) or Python (Django REST Framework patterns differ).
- **Domain**: game backend. F2P findings (PlayFab/LootLocker) carry direct domain weight; B2B SaaS findings (Stripe/Cal.com/Better Auth) carry stack weight.
- **Time**: 2026-Q2. Standard Schema v1 stabilized late 2025; RFC 9457 published 2023; Better Auth v1.5.0 shipped 2026-03. Findings are current; revisit if **Hono ships built-in JSON error middleware** (would change G3 default), if **tRPC's REST adapter `tRPC-OpenAPI` ships v1 GA** (would tighten the JSON-RPC-vs-REST split), or if **a major TS-native API publishes an RFC 9457 production adoption case study** (would close the spec-cited-only gap on Pattern Z).

## Operational implications

For BokChoy's slice 8.1 (first wallet HTTP handler) and the broader `[[wallet-http-contract]]` design pass that resolves GAP 9:

### G1 (route shape) — implication

The wallet wrapper signatures (`walletCredit/walletDebit/walletDeidentifyPlayer/bootstrapProjectReasonCodes`) are verb-heavy and don't fit CRUD cleanly. F2P RPC-style (`POST /v1/wallet/credit`, `POST /v1/wallet/debit`) is structurally closer to BokChoy's actual operations than REST flat-resource (`POST /v1/wallets/{id}/credits`). REST-with-verb-slug (Cal.com style: `POST /v1/wallets/credit` instead of `POST /v1/wallets/{id}/credits`) is a hybrid pinch-point. /design picks among:

- (a) **Pure RPC flat:** `POST /v1/wallet.credit` / `POST /v1/wallet.debit` (Google AIP). Maps wrapper functions one-to-one.
- (b) **REST verb-slug under resource:** `POST /v1/wallets/credit` / `POST /v1/wallets/debit`. Cal.com-style.
- (c) **REST nouns:** `POST /v1/wallets/{walletId}/transactions` with a `kind: 'credit' | 'debit'` discriminant in body. Wraps both operations under one endpoint. Requires more careful body-shape design.
- (d) **F2P-style PascalCase:** `POST /v1/Wallet/Credit`. Domain-cited (PlayFab) but breaks BokChoy's TS-camelCase grain.

**Body casing:** camelCase (TS-native default, matches wrapper API surface) vs snake_case (Stripe-shape end-to-end). Choosing camelCase removes a transformation layer — `walletId` flows from HTTP body → wrapper params unchanged. Choosing snake_case requires per-route case-transformation middleware.

**Response envelope:** top-level resource. All surveyed production APIs converge here. `{ "id", "wallet_id", "amount", ... }` for transaction credit/debit, **not** `{ "data": { ... } }` and **not** `{ "object": "transaction", ... }` (Stripe's discriminant field is unique to multi-resource endpoints).

**Idempotency placement:** header (`Idempotency-Key`), per `[[idempotency-strategy]]`. Already pinned.

### G2 (validator) — implication

Two viable picks:

- **`@hono/standard-validator` + a Standard Schema-compatible lib (Zod 4.x, Valibot 1.x, ArkType current).** Validator-neutral; switchable later. Better Auth's `better-call` already speaks Standard Schema, so the project's validator surface already has one Standard Schema consumer in scope.
- **`@hono/zod-validator` + Zod directly.** Most production-cited TS validator (Zod is the dominant 2025-2026 pick). Tighter coupling; more direct types.

The Standard Schema route is **defensible** because (a) BokChoy adopts Better Auth, which adopts better-call, which adopts Standard Schema; (b) the version-pin discipline already in `[[backend-stack]]` Amendment line 398 (drizzle-orm 0.45.x stable) suggests preferring stable-and-supported over aggressive — Standard Schema v1.1.0 is the broader-stable interface. The Zod-direct route is also defensible if /design wants the simpler types and the version-coupling cost is acceptable.

### G3 (error body) — implication

Three viable picks for /design:

- **Pattern X (Stripe-wrapped, `{ error: { code, message, ... } }`):** matches the SDK aspiration shape; production-cited in 2 ecosystems; cleanly maps to BokChoy's `WalletError.code/details` discriminated union (`code` = BcCode at top level, `details` flattened into siblings or kept nested).
- **Pattern Y (flat top-level, `{ code, message, ... }`):** aligns with Better Auth's own emission shape (the auth lib BokChoy uses already emits this shape on auth-errors); fewer keystrokes; HTTP status carries the "is-error" signal.
- **Pattern Z (RFC 9457 problem+json):** IETF spec-cited but ecosystem-divergent in TS-native cluster; would put BokChoy ahead of the curve, accept-ing the cost of being non-conformant with the dominant patterns.

**Cross-source mapping for the `WalletError.code/details` payload:**

The `[[wrapper-shape]]` `WalletError` already has `{ code: BcCode, details: Extract<ErrorDetails, { code: BcCode }>, message: string }`. Either Pattern X or Y maps cleanly:

- X: `{ "error": { "code": "BC010", "message": "Insufficient funds", "wallet_id": "...", "requested": "...", "available": "..." } }` (details flattened into the error object)
- Y: `{ "code": "BC010", "message": "Insufficient funds", "wallet_id": "...", "requested": "...", "available": "..." }` (details flattened to top level)

Both preserve all `WalletError.details` payload information; choice is purely about envelope.

### Wider cascade (orthogonal but worth flagging)

- **Idempotency wire-format (RFC 9457 successor):** the gap report cited RFC 7807 as the IETF spec. **It's superseded by RFC 9457 (July 2023, Standards Track, obsoletes 7807).** Update the gap report. Not load-bearing if BokChoy doesn't pick problem+json, but cite-correctness matters.
- **`409 → idempotency_error` mapping in Stripe** is direct precedent for BokChoy's `BC001 → 409` pinned in `[[wallet-mechanics]]`. The mapping convention is shared with Stripe, regardless of envelope choice.

## Reproducibility note

Reproducible. Sources are public web URLs (Stripe API docs, Hono docs, IETF RFC, PlayFab docs, Cal.com docs) and public GitHub repos (`stripe/stripe-node`, `better-auth/better-auth`, `bekacru/better-call`, `standard-schema/standard-schema`, `honojs/hono`, `honojs/middleware`). Search queries are recorded inline. Tools used: `gh api` for GitHub source access, `WebFetch` for documentation pages, `WebSearch` for the contradiction probe (RFC 9457 production adoption).

The judgment that survives reproduction:
- Cross-ecosystem-independence count favors Stripe-wrapped error shape (X) over flat top-level (Y) — verifiable by re-counting cited ecosystems.
- F2P RPC-style path scheme is structurally closer to BokChoy's verb-heavy wrapper API than B2B SaaS REST flat-resource — verifiable by listing BokChoy's wrapper signatures and asking "what HTTP shape is one-to-one with this?"
- RFC 9457 has minimal TS-native production adoption — verifiable by repeating the search and noting whether any major TS-native API has published a problem+json adoption case study.

The judgment that does NOT reproduce mechanically:
- "Better Auth + better-call should count as 1 ecosystem, not 2, for the conflict-resolution count" — this is an editorial judgment about whether shared authorship + shared dependency graph collapses the cite count. Documented inline; another investigator might count them as 2.

## Open threads

- **Standard Schema native support per validator + version.** What Zod / Valibot / ArkType versions ship native `~standard` interface support? Worth confirming at /design or implementation when picking the catalog dependency version. (Likely Zod 4.x, Valibot 1.x — but the README didn't enumerate.)
- **Hono OpenAPI middleware.** The search surfaced `hono-openapi` as a community middleware for OpenAPI doc generation that integrates with Standard Schema-compatible validators. If BokChoy adopts Standard Schema, hono-openapi is the documentation-generation cascade. Out of slice 8.1 scope; flag for SDK / docs slices.
- **`x-request-id` / request correlation header.** None of the surveyed APIs explicitly converged on a request-correlation header — Stripe's `request_id` is response-only. F2P PlayFab's `IdempotencyId` is in body. Worth a small spike at /design or at OTel-wiring time on the canonical request-correlation convention for BokChoy.
- **F2P backend wallet endpoint specifically (PlayFab Economy v2).** The source-walk hit `Inventory/AddInventoryItems` but didn't pull the equivalent **wallet credit/debit** endpoint. Worth one more fetch if /design wants direct domain-aligned shape comparison.
- **LootLocker error body shape.** Source 10 was partial — auth + path scheme only; body and error shapes weren't surfaced. Re-run with the docs.lootlocker.com `?ask=` query interface or sitemap.md if /design wants a stronger F2P-second-source cite.
- **better-call `OpenAPIError` and openapi metadata.** Better-call's `error.ts` imports OpenAPI types implicitly via the broader package. Worth knowing if `APIError` carries OpenAPI-spec annotations natively for runtime API-doc emission. Out of slice 8.1 scope.
