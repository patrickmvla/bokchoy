---
type: research
features: [marketing]
related: ["[[marketing/v1-shape]]", "[[_shared/oss-sdk-only]]", "[[cockpit/admin-list-endpoints-contract]]"]
created: 2026-05-14
confidence: high
provisional: false
---

# What do production game-economy SDKs name the customer-defined currency identifier on their list endpoint, and what fields do they expose?

## Question

The `GET /v1/currencies` endpoint owed by Slice M-1 has two unresolved contract details:

1. **Wire field name for the per-project customer-defined currency identifier.** Schema column is `code` (regex `^[A-Za-z0-9_]{1,16}$`, `packages/db/src/schema/wallet.ts:67,77`). SDK customer arg per `[[marketing/v1-shape]]` (iii) is `currency: 'gems'`. State.md (pre-amendment) typed wire field as `slug: string` without defense. Question: what do production game-economy SDKs (the class BokChoy occupies) name this field on the equivalent endpoint?

2. **Response field set on a customer-defined currency list endpoint.** Schema has 8 columns (`code`, `displayName`, `description`, `decimals`, `isPremium`, `isTradable`, `createdAt`, `updatedAt`). State.md typed 4 (`{ id, slug, displayName, createdAt }`). Question: what fields do production peers expose, and is `decimals` universally shipped on the currency-list endpoint?

The design seat staked Position D (rename column to `slug` + tighten regex to kebab-case) on training-data cites of Better Auth and Vercel. Those cites are dev-tool organizational/account identifiers — wrong class for currency naming. Handed to research for primary-source verification.

## Triangulation

- **Production reference:** ✓ — LootLocker, PlayFab Economy v2, RevenueCat, AccelByte, Nakama (Heroic Labs), Beamable. Plus generic-dev-tool corroboration: Better Auth, Vercel.
- **Docs reference:** ✓ — Microsoft Learn (PlayFab), RevenueCat docs, LootLocker docs, Better Auth docs, Vercel REST API reference. All version-current as of 2026-05.
- **Contradiction probe:** ✓ — Active search for a game-economy SDK using `slug` for currency identifier. **Returned empty.** WebSearch summary explicitly noted "slug isn't prominently featured as a standard field name for virtual currency identification."

## Sources examined

### Source 1 — LootLocker Currencies docs
- **Tier:** 2 (official docs) + 4 (search summary for some details)
- **Provenance:** `https://docs.lootlocker.com/commerce/currencies` (text returned via search summary; direct fetch returned a `.md?ask=` redirect hint). Cross-referenced with `https://ref.lootlocker.com/admin-api/` (admin API reference). Observed 2026-05-14.
- **Author context:** LootLocker is a commercial game backend platform; the docs are the canonical API reference for paying customers.
- **What it tells us:** Currency object exposes `id` (UUID), `name` (display), `code` (customer-defined identifier — "shorthand identifier, such as USD or GBP" per docs), `game_id` (tenant id), `published`, `game_api_writes_enabled`, `created_at`. List endpoint: `GET /admin/game/<game_id>/currencies`. When the currency code appears nested in another resource (e.g. progression rewards), the field is named `currency_code`, value example `"GLD"`. No `decimals` field. No premium/tradable flags. Wire field for identifier: **`code`**.

### Source 2 — PlayFab Economy v2 Virtual Currency Quickstart
- **Tier:** 2 (official docs)
- **Provenance:** `https://learn.microsoft.com/en-us/gaming/playfab/features/economy-v2/tutorials/currencies`. Last updated 2026-02-25 per page metadata. Observed 2026-05-14.
- **Author context:** Microsoft-owned, Generally Available product. Author is PlayFab DevRel (fprotti96 per page frontmatter); the docs reflect Microsoft's contractual API.
- **What it tells us:** Currencies are Catalog v2 Items of `Type: "currency"`. Customer-defined identifier is in an `AlternateIds` array with `Type: "FriendlyId"`, `Value: "diamonds"`. Prose: *"The `FriendlyId` is the currency code, which can contain between one and three alphanumeric values"* — explicitly named "the currency code" in plain English even though the JSON field type is `FriendlyId`. Constraint: 1–3 alphanumeric (mimics ISO 4217 ticker shape). Other fields on a currency: `Title` (localized display name dict), `Description` (localized dict), `ContentType`, `StartDate`, `CreatorEntity`. No `decimals` on the currency itself (decimals handled at the pricing/IAP layer). Wire identifier semantically: **"code"** (named `FriendlyId` in JSON).

### Source 3 — RevenueCat Virtual Currency docs
- **Tier:** 2 (official docs)
- **Provenance:** `https://www.revenuecat.com/docs/offerings/virtual-currency`. Observed 2026-05-14.
- **Author context:** RevenueCat is a commercial subscription-and-virtual-currency platform; the docs are the canonical reference for paying customers.
- **What it tells us:** Direct quote: *"**Code**: This is used across various APIs to identify the virtual currency (e.g: GLD)"*. Balance response example: `{"balance": 80, "currency_code": "GLD", "object": "virtual_currency_balance"}`. Wire field for identifier (top-level on currency object): **`code`**. When nested in balance response: `currency_code`. No `decimals`, no premium/tradable flags. Max balance bounded 0..2B; negative balances unsupported. Intentionally minimal field set.

### Source 4 — AccelByte Currency Management docs
- **Tier:** 4 (search summary; direct fetch returned empty content)
- **Provenance:** `https://docs.accelbyte.io/gaming-services/services/monetization/currencies/manage-currencies/`. Direct WebFetch returned no content; finding is from WebSearch summary cross-referencing two query passes. Observed 2026-05-14.
- **Author context:** AccelByte is a commercial game-backend platform (gaming-services). Docs are the canonical reference.
- **What it tells us:** Field named "**Currency Code**" (likely `currencyCode` in JSON per the standard Java/.NET naming AccelByte uses elsewhere). Real currencies follow ISO 4217; virtual currencies use customer-defined codes. Has `type: REAL | VIRTUAL` discriminator. Tier-4 cite; should be re-verified via direct doc fetch before being load-bearing in any decision beyond corroboration.

### Source 5 — Nakama (Heroic Labs) Economy docs
- **Tier:** 2 (official docs)
- **Provenance:** `https://heroiclabs.com/docs/nakama/guides/concepts/economy/`. Observed 2026-05-14.
- **Author context:** Heroic Labs ships the open-source Nakama server; docs are the canonical reference.
- **What it tells us:** **No Currency resource at all.** Wallets are stored as `map[string]int64{"gems": 100, "coins": 1000}`. The "currency name" is the map key — there is no separate Currency definition to list. Wallet update API consumes a `map[string]int64` for amount-deltas. Convention is lowercase strings (`gems`, `coins`). Not directly applicable to BokChoy's class (BokChoy explicitly chose a per-tenant Currency-row model in `packages/db/src/schema/wallet.ts`). Corroborates the **`gems`/`coins`** convention BokChoy already seeds.

### Source 6 — Better Auth Organization plugin docs
- **Tier:** 2 (official docs)
- **Provenance:** `https://www.better-auth.com/docs/plugins/organization`. Observed 2026-05-14.
- **Author context:** Better Auth is the auth library this project uses (per `auth: better-auth` project signal). Cited as the training-data backing for the design seat's Position D.
- **What it tells us:** Organization schema: `id`, `name`, `slug`, `logo` (opt), `metadata` (opt), `createdAt`. List endpoint: `GET /organization/list`. **Confirmed: Better Auth uses `slug`** — but for organizations (URL-friendly account identifier), NOT for currencies or any taxonomy resource. No documented regex/case constraint on the slug. **Wrong class for the currency-naming question.**

### Source 7 — Vercel REST API teams list-all-teams
- **Tier:** 2 (official docs, full JSON schema)
- **Provenance:** `https://vercel.com/docs/rest-api/reference/endpoints/teams/list-all-teams`. Last updated 2026-05-14 per page metadata. Observed same date.
- **Author context:** Vercel's canonical machine-readable API reference (OpenAPI spec linked).
- **What it tells us:** Team object required fields: `avatar`, `createdAt`, `creatorId`, `description`, `id`, `name`, **`slug`**, `stagingPrefix`, `updatedAt`. **Confirmed: Vercel uses `slug`** — for teams (URL-friendly account identifier). Same wrong class as Better Auth. Pagination is cursor-based via `since`/`until` timestamps.

### Source 8 — Stripe currency reference
- **Tier:** 2 (official docs)
- **Provenance:** `https://docs.stripe.com/currencies`. Observed 2026-05-14.
- **Author context:** Stripe's canonical reference.
- **What it tells us:** No Currency resource — Stripe ships ISO 4217 codes as a fixed enumeration, no `GET /v1/currencies` endpoint. On Charge/Subscription objects, the property is named `currency` with value `"usd"` (lowercase 3-letter ISO code). Direct quote: *"Make sure to use all lowercase letters when entering the three-letter ISO code in any payment request."* Zero-decimal vs. two-decimal status is **reference-table data**, not API-queryable per currency. **Confirms: Stripe property naming convention is `currency: 'usd'`** — same pattern as BokChoy's chosen SDK arg `currency: 'gems'`. Not a resource-identifier cite.

### Source 9 — Search-summary corroboration (game-economy class breadth)
- **Tier:** 4 (search summary, multiple sources aggregated)
- **Provenance:** WebSearch result on `"game backend SDK virtual currency API 'slug' field identifier"`, 2026-05-14.
- **What it tells us:** Aggregated mention of: Kongregate Kreds (terminology "internal identifier"), READYgg SDK (`id` + `currencyName`), Digital Turbine (token-based, different pattern). **No game-backend SDK in the surveyed set uses `slug`** for currency identification. WebSearch synthesis quote: *"slug isn't prominently featured as a standard field name for virtual currency identification in game backend APIs."* Closes the contradiction probe.

## Findings

### F1 — Game-economy class converges on `code`-shaped wire field for the customer-defined currency identifier

The class of systems most directly comparable to BokChoy (customer-defined per-tenant virtual currencies on a list endpoint) uses `code` or a code-shaped name. Per Sources 1, 2, 3, 4:

| System | JSON field name on currency object | Notes |
|---|---|---|
| LootLocker (Source 1) | `code` (top-level), `currency_code` when nested | Explicit "shorthand identifier, such as USD or GBP" |
| PlayFab (Source 2) | `FriendlyId` (in `AlternateIds` array) | Prose: "the currency code, 1–3 alphanumeric chars" |
| RevenueCat (Source 3) | `code` (top-level), `currency_code` when nested | Explicit: "used across various APIs to identify the virtual currency" |
| AccelByte (Source 4) | "Currency Code" (likely `currencyCode`) | Tier-4 cite; ISO 4217 reference noted |

**Tier 2 cites for `code`-shaped naming: 3 (LootLocker, PlayFab, RevenueCat).** Tier 4 corroboration: AccelByte. Zero of the surveyed game-economy SDKs use `slug` for currency identifier.

### F2 — Generic dev-tool class uses `slug` — but for organizational/account identifiers, not currencies

Per Sources 6, 7: Better Auth uses `slug` for organizations; Vercel uses `slug` for teams. **This is correct precedent for what BokChoy already uses on `projects.slug` and `organizations.slug`.** It is *not* precedent for currency identifiers — different resource class, different field semantics. The design seat's Position D conflated these classes.

### F3 — Stripe convention for the SDK customer arg is `currency` with the ISO-code value, not a separate identifier-field name

Per Source 8: when currency appears as a property on a Charge or Subscription, the property is `currency` and its value is the lowercase ISO code (`'usd'`). This is the pattern BokChoy already chose for the SDK customer arg (`bokchoy.wallets.credit({ currency: 'gems' })` per `[[marketing/v1-shape]]` (iii)). The wire-field-name decision for the list endpoint is *separate* from the SDK-arg-name decision and does not conflict — `code` (resource field) and `currency` (property whose value matches `code`) are coherent at different layers.

### F4 — Response field set on a currency-list endpoint varies; `decimals` is NOT universally exposed

Per Sources 1, 2, 3:

| System | Fields on currency object | `decimals` exposed? |
|---|---|---|
| LootLocker | `id`, `name`, `code`, `game_id`, `published`, `game_api_writes_enabled`, `created_at` | No |
| PlayFab | `FriendlyId`, `Title`, `Description`, `ContentType`, `StartDate`, `CreatorEntity` (currency inherits CatalogItem fields) | No (handled at the pricing layer) |
| RevenueCat | `code`, balance — intentionally minimal | No |
| AccelByte | (rich set; `currencyCode`, `currencySymbol`, `type`, likely `decimals` — tier-4 only) | Likely yes (tier-4, unverified) |

The mature commercial-product convention is to **NOT expose `decimals` on the currency-list endpoint** unless there's an explicit pricing/IAP use case (PlayFab) or a richer admin-config surface (AccelByte). The cleanest minimal SDKs (RevenueCat, LootLocker) ship `code` + display name + identity columns and nothing else.

## Conflicts

**No conflict on Gap 1.** The game-economy class converges cleanly on `code`-shaped naming (4 cites, 0 for `slug`). The contradiction probe explicitly searched for `slug` in the game-economy class and returned empty. There is a cross-class divergence (game-economy = `code`, generic-dev-tool = `slug`) but those are different resource classes — not in conflict, just answering different questions.

**Soft contention on Gap 2 (response field set).** AccelByte (Source 4, tier-4) and PlayFab (Source 2, tier-2) ship richer currency objects than LootLocker and RevenueCat. AccelByte exposes `decimals` and `type: REAL|VIRTUAL`; PlayFab inherits CatalogItem fields (~10+ catalog fields plus currency-specific ones). LootLocker and RevenueCat ship minimal. Per *Contradiction protocol*: when multiple production examples diverge, the conditions under which each wins matter — AccelByte/PlayFab serve larger-scale studios with multi-product catalogs; RevenueCat/LootLocker serve indie-to-SMB game devs (closer to BokChoy's *2-person-team* audience per `[[cockpit/cockpit-shape]]` (M2)). Audience-scale-matched precedent points minimal.

## Conditions

- **F1 holds across the surveyed game-economy SDK set as of 2026-05.** If a future game-backend platform (e.g. a 2027 Unity-funded entrant) chooses `slug`, the finding becomes contested. Triggered re-research: any new BokChoy-class entrant adopting `slug` for currency identification, OR a customer specifically requests `slug` wire-field naming on user-research grounds.
- **F4 (minimal field set) holds at MVP / SMB scale.** If BokChoy moves upmarket toward studios needing multi-currency-type-with-mechanics support (premium/soft, tradable, decimals for fractional points), the field set will need to expand. Triggered re-research: first paying-customer ask for any of `decimals`, `isPremium`, `isTradable` on the wire.
- **All findings assume the BokChoy `GET /v1/currencies` endpoint serves the SDK first, the admin UI second.** If a future admin-UI surface needs richer fields than the SDK does, those are an admin-only sibling endpoint, not an expansion of the SDK-facing list. *Two endpoints for two audiences* is the production pattern (LootLocker has separate Admin API and Game API; PlayFab has Catalog admin endpoints vs Inventory player endpoints).

## Operational implications

The two open contract questions on Slice M-1 resolve as follows:

### Gap 1 → adopt Position A (wire field = `code`, no schema change)

The `[[marketing/v1-shape]]` Mitigation #1 framing ("slug-resolution") was generic English at vault time; the wire field is **`code`**, matching the existing DB column. Three layers, two names total:

| Layer | Name | Cite |
|---|---|---|
| DB column | `code` | `packages/db/src/schema/wallet.ts:67` (already shipped) |
| Wire field | `code` | LootLocker, RevenueCat, AccelByte (Sources 1, 3, 4); PlayFab semantically (Source 2) |
| SDK customer arg | `currency` (Stripe-style property) | `[[marketing/v1-shape]]` (iii); Stripe (Source 8) |

The design seat's Position D (rename column to `slug` + tighten regex) is **superseded by this research**. Better Auth + Vercel are not precedent for currency naming — they are precedent for organizational/account identifier naming, which BokChoy already follows correctly on `projects.slug` and `organizations.slug` (different class, no change).

**No migration owed.** `currencies.code` stays. The handler does `.select({ id, code, displayName, createdAt })` against the existing schema.

**Amendment owed to `[[marketing/v1-shape]]`:** the Mitigation #1 example error message currently reads *"UnknownCurrencyError: 'gem' is not a registered currency. Available: ['gems', 'coins']."* — the prose works as-is; only update the framing word "slug-resolution" → "code-resolution" or leave "slug-resolution" as a generic-English term with a clarifying parenthetical: *"(slug-resolution: the SDK maps the customer-typed `currency` arg string to its DB row via the `code` field)"*. The design seat picks which wording.

### Gap 2 → adopt Position α' (4 fields, with `slug` substituted for `code`)

**Wire shape:** `{ id: uuid, code: string, displayName: string, createdAt: iso }`.

Defense: matches RevenueCat (Source 3) and LootLocker (Source 1) audience-scale-matched precedent (SMB / indie game-dev). PlayFab/AccelByte richer-field precedent (Sources 2, 4) loses on audience-scale match per F4. `decimals` deferred to a field-additive amendment when (a) the SDK ships a balance-display helper that needs formatting, or (b) a customer asks for fractional-amount currency support. `isPremium` / `isTradable` deferred indefinitely — they're economy-mechanic flags BokChoy's schema chose to ship pre-emptively; exposing them on the OSS SDK type surface before the SDK has shaped how they're consumed would be premature.

**Field additions are backward-compatible** (adding fields to a JSON response object is a non-breaking change for OSS-SDK consumers per standard semver-of-JSON-wire-shapes). The cost of deferring is zero; the cost of premature exposure is type-surface lock-in.

### Cascade owed once `/design` writes the M-1 contract amendment

1. **`[[marketing/v1-shape]]`** — minor wording amendment to Mitigation #1 ("slug-resolution" framing) per Gap 1 resolution above.
2. **`.bocek/state.md`** — clear the "Open research scope — currencies endpoint wire shape" section; replace with "M-1 contract amendment landed in `[[marketing/v1-shape]]`; ready for /implementation."
3. **`apps/backend/src/currencies/index.ts`** — the new file; handler reads `currencies` table filtered by `c.var.projectId` (set by `apiKeyMiddleware`); wire shape per Gap 2 above; ordering `desc(createdAt)` matching `apps/backend/src/projects/index.ts:369` precedent.
4. **`apps/backend/src/index.ts`** — mount `mountCurrenciesRoutes(app)` alongside the existing `mountProjectsRoutes(app)` at line 128.
5. **OTel span `currencies.list`** with `bokchoy.project_id` attribute per state.md M-1 spec.

## Reproducibility note

Reproducible. Anyone surveying the 9 sources above with the same questions should reach substantially the same finding. Key evidence is at tier 2 for the game-economy class (Sources 1, 2, 3) plus generic-dev-tool corroboration (Sources 6, 7). AccelByte (Source 4) and Beamable (untested cleanly in this session) are open at tier 4 — re-verification via direct doc fetch would strengthen but not change the conclusion. The contradiction probe is replicable: a web search for "game backend SDK virtual currency 'slug' field" returns no positive hits.

Investigation tools used: WebSearch (Anthropic-side web search), WebFetch on canonical docs URLs. No clones, no POC sketches. Total session investigation time bounded.

## Open threads

- **Beamable currency content schema not fully resolved.** The docs reference `CurrencyRef` and `currencyContentPrimary.Id` but don't expose the field naming for the underlying content object in the pages fetched. If a future research seat needs to verify the 5th game-economy cite, fetch the C# API reference at `csharp.docs.beamable.com` for the `Beamable.Common.Api.Inventory.Currency` class directly.
- **AccelByte CurrencySummary needs direct-fetch verification.** Source 4 is tier-4. The conclusion doesn't hinge on it (3 tier-2 cites already concur), but a tier-2 confirmation would close the AccelByte cite cleanly.
- **SDK customer-arg name (`currency` vs `currencyCode`)** — this research resolved the WIRE field, not the SDK customer arg. `[[marketing/v1-shape]]` (iii) committed to `currency` (Stripe-style property pattern). Whether to revisit this on `currencyCode` (AccelByte) grounds is a /design question, not blocked by this research.
- **The 1-3 char ISO-mimicry constraint** (PlayFab Source 2) vs BokChoy's existing `^[A-Za-z0-9_]{1,16}$` is a divergence — BokChoy allows longer + underscored identifiers (`'level_up_reward'`-shape, though that's reason_codes not currencies). Not a blocker; the BokChoy regex is more permissive than PlayFab's. If a future design pass wants to tighten currencies to ISO-shape for SDK-author muscle memory, the conditions are there.
