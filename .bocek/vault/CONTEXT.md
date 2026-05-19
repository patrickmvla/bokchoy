---
vault_version: 2
created: 2026-05-18
---

# BokChoy — Domain Context

BokChoy is a game-economy backend platform for indie/SMB studios: wallets, currencies, transactions, idempotent ledger primitives on Postgres, consumed by OSS SDKs.

## Language

### Surfaces

**BokChoy:**
The product itself — backend + cockpit + SDKs serving wallet/economy primitives to game studios.

**Backend:**
The Hono API server at `apps/backend/`. Exposes the `/v1/...` HTTP surface the SDK calls.
_Avoid_: "API server", "server" (ambiguous with Postgres)

**Cockpit:**
The operator admin UI at `apps/cockpit/`. Next.js app, Better Auth session, project + API key management.
→ see [[cockpit/file-structure]]
_Avoid_: "dashboard", "admin", "console"

**Marketing:**
The public landing surface inside Cockpit's `app/(marketing)/` route group. Same Next.js deployment, no auth gate.
→ see [[marketing/v1-shape]]
_Avoid_: "marketing site" (it isn't a separate site)

**SDK:**
`@bokchoy/sdk-node` and future siblings — OSS (MIT) client libraries customers install. Per-language, per-repo.
→ see [[_shared/oss-sdk-only]]
_Avoid_: "client", "library" (too generic)

### Principals

**Organization:**
Better Auth's multi-user tenant. Owns zero or more Projects. The signup unit for an Operator.

**Project:**
The RLS tenant root for all BokChoy ledger data. Every Wallet, Transaction, Currency, Player belongs to exactly one Project. Tenant boundary, enforced by `app.current_tenant` GUC.
→ see [[architecture/multi-tenant-rls-research]]

**Operator:**
A human signed in to Cockpit with a Better Auth session, acting on behalf of an Organization. BokChoy's *customer*.
_Avoid_: "user" (overloads with Player), "admin" (overloads with `adminGate`)

**Player:**
The Operator's end-user — a game player. Lives inside a Project. Identified externally by `external_id` (customer-controlled string), internally by `playerId` UUID. NOT a BokChoy operator.
→ see [[wallet/credit-route-contract]]
_Avoid_: "user", "customer" (reserved for Operator)

**API key:**
Bearer credential the SDK uses to authenticate to the Backend. Scoped to exactly one Project. HMAC-stored.
→ see [[cockpit/admin-list-endpoints-contract]]

### Wallet domain

**Currency:**
A per-Project denomination (e.g. `gems`, `coins`). Wire-facing identifier is `code` (slug, regex `^[A-Za-z0-9_]{1,16}$`); internal identifier is `currencyId` UUID never exposed to SDK customers.
→ see [[marketing/currencies-endpoint-research]]
_Avoid_: "slug" as a field name (acceptable in prose), "denom"

**Wallet:**
A balance-holding row, unique per (Project, Player, Currency). Storage is `NUMERIC(20,4)`. Lazy-created on first credit per `[[wallet/credit-route-contract]]`.
→ see [[architecture/wallet-mechanics]]

**Transaction:**
An append-only audit-log row in the `transactions` table. Kinds: `currency_credit`, `currency_debit`, `item_grant`, `item_consume`, `compensation_grant`. Composite PK `(id, created_at)` for future partitioning.
_Avoid_: "txn" (use `Transaction` in prose, `txn` only in code), "DB transaction" / "SQL transaction" (those are `BEGIN...COMMIT` blocks)

**Reason code:**
A per-Project allowlist string explaining *why* a Wallet moved (e.g. `level_up_reward`, `iap_consume`). Category: `faucet | drain | transfer | admin`. Composite-FK target from `transactions`.

**Idempotency key:**
Stripe-pattern dedupe row in `idempotency_keys`. Brandur-shape: `locked_at` NULL-until-locked, `completed_at` terminal. 24h reaper TTL.
→ see [[architecture/idempotency-strategy]]

**Inventory:**
A Player's non-currency item holdings within a Project — items, stacks, item instances. Separate primitive from Wallet at the BokChoy data model (per game-economy SDK class split — Nakama, LootLocker, AccelByte all split items from currencies; PlayFab unifies but is the outlier).
→ see [[inventory/inventory-contract]]
_Avoid_: "items" as a standalone domain term (use Inventory for the primitive; "item" for an individual entry)

**Item:**
A per-Project catalog row describing a single ownable thing (e.g. `health_potion`, `legendary_sword`). Wire-facing identifier is `code` (slug, regex `^[A-Za-z0-9_]{1,64}$`); internal identifier is `itemId` UUID never exposed to SDK customers. Carries `stackable` flag determining ownership model: stackable → consolidated count, non-stackable → per-instance UUID.
→ see [[inventory/inventory-contract]]
_Avoid_: "slug" as a field name (acceptable in prose), "asset" (LootLocker term — Item is the BokChoy convention)

### Operational primitives

**External ID:**
Customer-controlled string identifying a Player on the wire (`/v1/players/{externalId}/...`). Regex `^[A-Za-z0-9._-]{1,128}$`. HMAC-hashed with project-salt before any observability emission per `[[wallet/credit-route-contract]]`.
_Avoid_: "player ID" (ambiguous with `playerId` UUID)

**Lazy-create:**
Pattern where credit on an unknown `external_id` materializes the Player + Wallet rows in the same DB transaction. Avoids the explicit `POST /v1/players` round-trip game-economy SDKs typically reject.
→ see [[wallet/credit-route-contract]]

**Tenant GUC:**
The Postgres session-level setting `app.current_tenant` whose value drives every RLS policy's `USING (project_id = current_setting(...))` clause. Set via `set_config('app.current_tenant', <projectId>, true)` at the start of every wrapper call.
→ see [[architecture/multi-tenant-rls-research]]

**Staged job:**
A row in the `staged_jobs` outbox table (Postgres-backed, not Redis). Workers claim via `SELECT ... FOR UPDATE SKIP LOCKED`. Kinds: webhook fire, mailbox push, IAP receipt validate, analytics event, idempotency reaper.
→ see [[architecture/staged-jobs-schema-research]]
_Avoid_: "queue", "job queue" (Redis-coded vocabulary)

### Strategy

**Wedge:**
BokChoy's targeted market position — indie/SMB game studios, F2P economies, sub-$1M revenue, OSS-SDK distribution.
→ see [[wedge/wedge-decision]]

**MVP:**
The v1 feature scope — currencies, wallets, credit/debit/balance/history routes, cockpit + marketing chrome, `@bokchoy/sdk-node`.
→ see [[mvp/mvp-feature-sequence]]

## Relationships

- An **Organization** has one or more **Projects**.
- A **Project** has zero or more **Operators** (via Better Auth Org membership), zero or more **API keys**, zero or more **Players**, zero or more **Currencies**, zero or more **Reason codes**.
- A **Wallet** belongs to exactly one (**Project**, **Player**, **Currency**) triple.
- A **Transaction** belongs to exactly one **Project**; references at most one **Wallet** (NULL for item-only kinds); cites exactly one **Reason code**.
- A **Player** belongs to exactly one **Project**, identified externally by exactly one **External ID** within that Project.
- An **Idempotency key** belongs to exactly one **Project**; uniquely identifies one request within that Project for 24h.

## Example dialogue

> **Dev:** "When the SDK calls `wallets.credit({ player: 'p_123', currency: 'gems', amount: 100 })` and `p_123` doesn't exist yet, does the call fail?"
> **Domain expert:** "No — lazy-create. The credit handler materializes the Player row and the (project, player, currency) Wallet row in the same DB transaction as the Transaction insert. The customer never sees an `UNKNOWN_PLAYER` error on credit. Read paths (balance, history) return synthesized zero/empty for unknown players instead of 404."
>
> **Dev:** "And if the Currency code `gems` isn't registered in that Project?"
> **Domain expert:** "Credit returns `UNKNOWN_CURRENCY` with the available codes enumerated. Currencies are explicitly seeded — `gems` and `coins` are defaults on project create, but custom codes need a Currency row first."

## Flagged ambiguities

- **"currency"** was used to mean both the wire-facing `code` slug (`'gems'`) and the internal `currencyId` UUID — resolved: **`code` is the user-facing identifier; `currencyId` is the internal-only PK and never appears in SDK or HTTP surfaces**. "Slug" is acceptable in prose but `code` is the field name everywhere (game-economy class convention per `[[marketing/currencies-endpoint-research]]` F1).

- **"player"** was overloaded across the `players` DB row (`playerId` UUID), the customer-controlled `external_id` (URL path identifier), and the F2P end-user concept — resolved: **`Player` (capitalized) = the domain concept; `external_id` = the wire-facing identifier; `playerId` = the internal UUID never exposed to the SDK customer**.

- **"customer"** vs **"operator"** vs **"player"** were used interchangeably in early prose — resolved: **Operator = BokChoy's customer (the game studio dev in Cockpit); Player = the Operator's end-user. "Customer" alone (no qualifier) always refers to the Operator**. Marketing copy speaks to Operators, not Players.

- **"transaction"** was overloaded between the `transactions` audit-log row and a SQL `BEGIN...COMMIT` block — resolved: **`Transaction` (capitalized noun) = audit-log row; SQL `BEGIN...COMMIT` is always called "DB transaction" or "txn" in code**.

- **"wallet"** was used in singular without Currency context — resolved: **a Wallet is the (Project, Player, Currency) tuple. A Player has zero or more Wallets across Currencies; "the player's wallet" must be qualified by Currency in technical writing**. SDK copy ("the player's wallet") is allowed only when the Currency is unambiguous from surrounding code.
