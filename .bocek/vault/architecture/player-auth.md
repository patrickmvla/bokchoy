---
type: decision
features: [auth, compliance]
related: ["[[auth-compliance-research]]", "[[wallet-mechanics]]", "[[deidentify-mechanism-research]]", "[[multi-tenant-rls-research]]", "[[host-platform]]", "[[wedge-decision]]", "[[mvp-feature-sequence]]", "[[idempotency-strategy]]"]
created: 2026-05-03
confidence: high
---

# Player auth model: owned-only + minimal-PII + processor-stance + no age-gate

## Decision

BokChoy MVP ships **owned player authentication** with the following committed shape:

### 1. Player auth model: owned-only at MVP, pass-through deferred post-MVP

BokChoy stores player credentials and validates login attempts on its own infrastructure. Players are per-project (no cross-project player portability at MVP). **Pass-through (BokChoy validates customer-issued JWT against customer-supplied JWKS) is deferred to post-MVP**, demand-gated on signal *"first paying customer with a live game (existing player base) requests pass-through integration."*

### 2. PII scope: (i)/(γ) minimal-PII

`players` schema (per-project, RLS-protected per `[[multi-tenant-rls-research]]`):

```sql
CREATE TABLE players (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id      UUID NOT NULL REFERENCES projects(id),
  email           TEXT NULL,                          -- opt-in only; NULL for guest accounts
  password_hash   TEXT NULL,                          -- argon2id; NULL when email NULL
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_login_at   TIMESTAMPTZ NULL,
  locale          TEXT NULL,                          -- BCP 47; auto-detected from device on first auth
  under_13        BOOLEAN NULL,                       -- customer-flagged per Unity GS pattern; default NULL
  UNIQUE (project_id, email) WHERE email IS NOT NULL  -- email unique within project, but optional
);
```

Email and password are nullable because **guest play is supported and is the default flow**. Most player rows will have `email = NULL` and `password_hash = NULL` — identified by opaque `id` only. Email is captured at one of: (a) first IAP for receipt delivery, (b) account recovery setup, (c) explicit player-initiated upgrade. No profile fields (display_name, avatar_url, age, gender, etc.) on the players table — those live in customer-side game state, joined by `id` via customer's API.

Password hashing: argon2id (memory-hard, OWASP-recommended). Specify cost parameters: m=64MB, t=3, p=4 (initial values; revisit per `[[wallet-mechanics]]` revisit-when style).

### 3. Compliance stance: processor (GDPR) + service-provider third party (COPPA)

Per `[[auth-compliance-research]]`:

- **GDPR:** customer-developer is the controller; BokChoy is the processor under Article 28. Player data is processed only on documented customer instruction. BokChoy DOES NOT use player PII for cross-customer purposes (analytics improvement, ML training, behavioral profiling) — these would flip BokChoy to controller-stance for that activity per EDPB Guidelines 07/2020.
- **COPPA:** customer-developer is the operator (the entity facing children). BokChoy is the third-party vendor receiving information "on behalf of an operator" per 16 CFR §312.2. The §312.2 service-provider "internal operations" exception applies — BokChoy may not use info "to contact a specific individual, including through behavioral advertising."
- **CCPA/CPRA:** customer is Business; BokChoy is Service Provider.

### 4. No contractual age-gate; family-aimed customers in scope at MVP

`projects` table gains `is_child_directed BOOLEAN NOT NULL DEFAULT FALSE` (customer flag, set on project creation, immutable without manual review). When `is_child_directed = TRUE`:

- Per-player `under_13` flag becomes operationally relevant
- BokChoy refuses to allow under_13 players to populate the email column (guest-only)
- Audit logging tightens on under_13 records (PII access logs flag under_13 reads)
- Customer must complete COPPA written-assurance flow at project creation (gated UI; sign DPA addendum + acknowledge operator obligations)

Industry pattern per Unity GS (`docs.unity.com/ads/en-us/manual/COPPACompliance`): customer flags app-level + per-user designations; vendor ships toggles, customer holds the determination.

### 5. Required legal infrastructure at MVP

Copy-and-adapt approach using public templates from `[[auth-compliance-research]]` Sources 4-6:

- **Article 28 DPA template** — modeled on PlayFab/Unity DPA shape: explicit "process on documented instructions," sub-processor authorization, security obligation, audit cooperation, data subject assistance, return-or-delete-on-termination, breach-notify-without-undue-delay
- **Standard Contractual Clauses (SCC)** for international data transfers — EU-US transfers via 2021 SCC Module 2 (Controller-to-Processor); annex-fill from templates
- **COPPA written-assurance template** per 2025 amendments (effective 2025-06-23, full compliance 2026-04-22) — security commitment + flow-down obligations + audit cooperation language; modeled on Foley Hoag's enumerated requirements ("data-flow diagrams, audit rights, indemnities, prompt breach notification, and an obligation to flow down COPPA safeguards")
- **Security questionnaire response** — pre-filled responses for SIG-Lite / CAIQ / customer-supplied questionnaires; reference architecture from `[[wallet-mechanics]]`, `[[multi-tenant-rls-research]]`, `[[deidentify-mechanism-research]]`, `[[host-platform]]`

Estimated MVP legal-infra cost: 1-2 weeks of work (templates copied, lawyer review of final language at $2-5K — solo founder rate). Onboarding new customers post-MVP: hours not weeks once templates land.

### 6. Required technical infrastructure at MVP

- **DSR-fulfillment primitives** (extends `[[deidentify-mechanism-research]]` HMAC pattern):
  - `bokchoy.player_export(p_player_id UUID)` — stored function returns full player record + transactions + loot_rolls (joined via `player_id`); customer invokes to fulfill DSAR access requests
  - `bokchoy.player_erase(p_player_id UUID)` — stored function calls existing de-id mechanism (HMAC-SHA-256 + key-destruction); preserves transaction audit shape per `[[wallet-mechanics]]` §6 retention
  - Both functions are M2-pattern (stored-function-only-interface) per `[[wallet-mechanics]]`'s mechanism choice
- **Audit logging** for PII access — every read of `email` or `password_hash` columns by `bokchoy_app` role logs to `pii_audit` table (player_id, accessor, ts, reason); enforced via column-level GRANT + trigger
- **Breach detection** — bulk-export-attempt rate limiter on `player_export`; alerts on >N exports per hour per project
- **Encryption at rest** — Postgres TDE / Supabase managed encryption-at-rest (cascade: verify Supabase encrypts at rest by default, document in `[[host-platform]]` cascade)
- **TLS 1.2+ minimum** on player auth endpoints; perfect-forward-secrecy required ciphers

## Reasoning

### Why owned-auth at MVP, pass-through deferred

Pass-through (BokChoy validates customer-issued tokens against customer-supplied JWKS) is a deeper customer integration than owned: customer must provide JWKS endpoint + claim mapping + key-rotation coordination + JWT format spec. Owned-auth is drop-in SDK at the customer side. **Operational implication: at MVP capacity (solo dev + 20-month runway per `[[wedge-decision]]`), the lighter-integration option ships first.** Pass-through preserves the option of post-MVP deeper-integration customers without coupling MVP to the harder path.

The "we need customer trust before pass-through" framing from earlier was wrong on the trust axis (owned actually requires *more* customer trust — BokChoy holds player credentials, customer's player relationship rides on BokChoy security) but right on the integration-burden axis.

### Why minimal-PII (γ)

Three product decisions push toward minimal-PII:
1. **Cockpit shows player IDs, not names, at MVP.** Profile data is fetched from customer-side via API when display is needed. Cockpit-as-wedge per `[[wedge-decision]]` is preserved — IDs + wallet state + transaction history is enough for live-ops; recognizable names are nice-to-have, not load-bearing at MVP.
2. **SDK is data-only at MVP.** No UI components shipped; SDK returns IDs and game-economy data, not profile rendering.
3. **Guest play supported with no email.** Most player rows will have NULL email + NULL password_hash. PII collection is the exception, not the default.

Per `[[auth-compliance-research]]` Finding 6: minimal-PII is *cheaper* to ship than standard-PII, not more expensive. Fewer columns, fewer DSR fields, narrower breach blast radius. Email-only is the smallest legally-defensible footprint that still allows IAP receipts and account recovery.

The "we need to own all our info" framing from early in the session was a category error: it conflated **owned** (which fields land in BokChoy's DB) with **controller** (legal stance under GDPR). Per `[[auth-compliance-research]]`, these are orthogonal — BokChoy can be processor *and* hold minimal-PII *and* control its own data infrastructure. (production-cited via PlayFab + Unity GS; high confidence)

### Why processor-stance

3-of-3 surveyed game-backend SaaS DPA-position as processor for end-user player data (PlayFab SCC Annex I, Unity DPA, Heroic Labs §2/§6 per `[[auth-compliance-research]]` Sources 4-6). EDPB Guidelines 07/2020 framework supports: customer-developer determines essential means (which players, what fields, what retention), BokChoy determines non-essential means (technical infrastructure). FTC Apitor enforcement (2025-09) confirms COPPA operator-stance lands on the customer-developer; verbatim FTC principle: *"outsourcing functionality does not outsource liability"* — and the liability lands on the operator, not the SDK vendor.

Burden delta is material: under controller-stance, BokChoy would field DSRs directly + carry direct breach-notification obligation under Article 34 + carry first-line COPPA operator obligation. Under processor-stance, all three flow through customer. (production-cited Sources 4, 5, 6; doc-cited Sources 1, 2, 3; confidence: high)

### Why no contractual age-gate

Wedge ICP (D=yes per session 2026-05-03) explicitly includes family-aimed studios. Cutting them off via contractual age-gate would deviate from the wedge commitment, deviate from industry pattern (no surveyed vendor age-gates), and lose paying customers in the indie-family slice (Toca-Boca-shape, casual-family puzzle, kids UGC). The 1-2 week legal infra cost to support COPPA written-assurance is bounded and amortizes across all customers. (industry-cited per `[[auth-compliance-research]]` Finding 4; confidence: high)

### Why per-project players, not cross-project

Cross-project player portability ("one BokChoy account, multiple customer games") would push BokChoy toward joint-controller territory per EDPB 07/2020 "inextricably linked" test — BokChoy would be determining the purpose of cross-customer identity. Per-project players preserve clean processor-stance + match the per-tenant-isolation pattern from `[[multi-tenant-rls-research]]`. Wedge ICP doesn't require cross-project at MVP; can be revisited if a paying customer needs it. (inferred from EDPB framework + multi-tenant-rls cascade; confidence: medium)

## Engineering substance applied

- **Consistency:** `UNIQUE (project_id, email) WHERE email IS NOT NULL` enforces per-project email uniqueness without forcing email collection. Postgres partial index — standard pattern. Idempotent registration via `[[idempotency-strategy]]` Idempotency-Key header for client retries.
- **Failure semantics:** account recovery requires email-on-file (registered accounts only). Guest accounts have no recovery path — by design, customer game state is the recovery mechanism (App Store / Google Play account binding, customer-issued recovery code). This matches indie F2P industry pattern (Genshin "this device" model). At-most-once registration via Idempotency-Key per `[[idempotency-strategy]]`.
- **Concurrency:** standard auth flows are CRUD on player row guarded by RLS per `[[multi-tenant-rls-research]]` (`SET LOCAL app.current_tenant`) + unique constraints. No multi-row coordination needed for auth itself; wallet/loot operations already governed by `[[wallet-mechanics]]` mechanisms.
- **Observability:** PII access logged via column-level GRANT + audit trigger; bulk-export rate limiter alerts on >N exports/hr/project; failed-login attempts logged at IP + project granularity for credential-stuffing detection. Page on credential-stuffing signal (>K failed logins per IP per hour per project — initial threshold value, revisit on operational data).
- **Security:** trust boundary diagram for owned-auth at MVP:
  ```
  [Player device] →TLS→ [Customer-developer's server] →TLS+SDK_key→ [BokChoy API]
                                                                      ↓
                                                                [Postgres + RLS]
  ```
  Player ↔ BokChoy is mediated by customer-developer's server. Customer's SDK key authenticates server-to-BokChoy. Player session token (if registered) validates against BokChoy's session store on each call; guest player session is opaque token issued by BokChoy at first contact, valid until customer issues `bokchoy.player_logout` or session_ttl elapses.
  - Trust changes hands: customer-developer's server holds player credentials in transit (login flow proxies through it) — customer is responsible for not logging credentials. Vault as risk in failure modes.
- **Storage:** minimal-PII = ~7 columns on players. No JSONB profile blob. PII at rest encrypted via Postgres / Supabase encryption-at-rest. Monthly partitioning per `[[wallet-mechanics]]` retention pattern (does NOT apply to players table directly — players is non-partitioned, but transactions referencing player_id are partitioned).

## Production-grade gates

- **Idiomatic** — owned-auth with optional email + minimal profile + per-tenant isolation is the standard B2B SaaS auth pattern. Argon2id is OWASP-recommended (current as of 2024). Postgres unique partial index + RLS is the canonical multi-tenant pattern per `[[multi-tenant-rls-research]]`. Stored-function-only-interface for DSR matches `[[wallet-mechanics]]` M2 mechanism. **(idiom-cited; confidence: high)**

- **Industry-standard** — Processor-stance + customer-as-controller + ship COPPA primitives + customer-flags-audience is the universal pattern across PlayFab (Microsoft), Unity Gaming Services (Unity Technologies), and Heroic Labs (per `[[auth-compliance-research]]` Sources 4-6). All three are named production game-backend SaaS, named DPAs publicly available. **(production-cited × 3; confidence: high)**

- **First-class** — Postgres native: partial unique index for nullable email, RLS for per-tenant isolation, stored functions for M2 enforcement, encryption-at-rest via standard Postgres / managed-host primitive. No custom auth-state-machine — argon2id is well-supported in TS/Go/Python ecosystems via standard libraries (e.g., `argon2-browser`, `node-argon2`, `golang.org/x/crypto/argon2`). DSR primitives are SQL functions, not custom services. **(first-class-cited; confidence: high)**

## Rejected alternatives

### Alternative A — Pass-through-only at MVP (BokChoy validates customer-issued JWTs)

**What:** BokChoy stores no player credentials. Customer issues JWTs from their own auth system; BokChoy validates against customer-supplied JWKS and trusts claims for `player_id`.

**Wins when:** customer ICP is dominated by studios with existing live games + existing auth infrastructure who don't want to re-onboard players to a new auth system. Heavily server-integrated B2B customers.

**Why not here:** wedge ICP per `[[wedge-decision]]` skews indie/SMB starting fresh; pass-through requires customer-side JWKS + claim mapping + key-rotation coordination, which is integration burden indie customers don't have capacity for at MVP. Owned-auth is the lighter-integration default for new-game customers.

### Alternative B — Both pass-through AND owned at MVP

**What:** Ship both player auth models simultaneously at MVP. Customer chooses on project creation.

**Wins when:** customer ICP is genuinely heterogeneous (50/50 new-game + existing-game) and team capacity supports two auth surfaces simultaneously.

**Why not here:** solo-dev MVP capacity per `[[mvp-feature-sequence]]` 7-month plan can't ship 2x auth surfaces. Each surface has its own threat model, SDK token shape, integration docs, support burden. Pass-through deferred to post-MVP demand-gated trigger preserves the option without coupling MVP to it.

### Alternative C — Standard-PII (ii) — players table includes profile fields (display_name, avatar_url, etc.)

**What:** BokChoy stores player profile fields by default. SDK auto-returns profile on every identity call. Cockpit displays names natively.

**Wins when:** SDK ships UI components at MVP (login screens, account UI, leaderboards-with-avatars) requiring profile data inline; cockpit live-ops use cases require recognizable players for support and engagement workflows.

**Why not here:** answers (A) cockpit IDs-only + (B) SDK data-only + (C) guest-no-email all push toward minimal. Profile data lives customer-side in their game state, joined by `player_id`. Adds DSR surface (more fields to export/erase), expands breach blast radius, increases COPPA exposure for under-13 players, with no MVP product win.

### Alternative D — Controller-stance (BokChoy as data controller for player PII)

**What:** BokChoy positions itself as data controller for player records. Direct DSR handling from end-users; direct Article 34 breach notification obligation; first-line COPPA operator obligation.

**Wins when:** BokChoy uses player PII for its own purposes beyond customer instruction (cross-customer analytics, ML training, behavioral profiling, ad targeting).

**Why not here:** zero of three surveyed production game-backend SaaS take this stance for player game data; no production cite supports it; burden is materially heavier (per `[[auth-compliance-research]]` Finding 6); BokChoy's wedge does NOT require cross-customer player data use. **Vault as named rejected alternative** — re-derive controller analysis if BokChoy ever ships a feature that uses cross-customer player data (e.g., cross-customer player portability, BokChoy-owned identity layer, ad-network monetization).

### Alternative E — Contractual age-gate (no under-13 customer audiences allowed)

**What:** BokChoy's terms contractually prohibit customer-developers from shipping to under-13 audiences. Customer attests on project creation.

**Wins when:** wedge ICP excludes family-aimed studios + team capacity can't sustain COPPA written-assurance contractual surface.

**Why not here:** wedge ICP (D=yes) includes family-aimed studios per session 2026-05-03 commitment. 2025 COPPA written-assurance template is bounded one-time legal infra work (~1-2 weeks copying public templates). Cutting off family-aimed studios deviates from wedge + cuts paying customers + deviates from industry pattern (no surveyed vendor age-gates).

### Alternative F — Cross-project players (single BokChoy player ID across all customer games)

**What:** One BokChoy player record, multiple project memberships. Player can sign in once and access multiple customer games.

**Wins when:** BokChoy positions as identity-provider across the gaming ecosystem (Steam-shape, Epic Games Store-shape).

**Why not here:** per EDPB 07/2020 "inextricably linked" test, cross-project portability would push BokChoy toward joint-controller territory — BokChoy would be determining a purpose (cross-customer identity) outside any individual customer's instruction. Wedge ICP doesn't require cross-project at MVP. Per-project players preserve clean processor-stance and match `[[multi-tenant-rls-research]]` per-tenant-isolation pattern.

## Failure modes

### F1 — Credential stuffing against player auth endpoints

Indie F2P games are common targets for credential stuffing (compromised credentials from other breaches reused). Without rate limiting + bot detection, BokChoy auth endpoints become a credential-validation oracle.

**Mitigation:** rate-limiter at IP + project granularity (initial values: 10 failed logins / IP / hour / project, 100 failed / project / hour); CAPTCHA required after threshold; CIDR-block on identified attackers; alert on >K failed logins / project / hour. Implementation in MVP cookpit. **Revisit threshold values when first credential-stuffing wave observed.**

### F2 — Guest account hijacking via session token leak

Guest accounts have no recovery path; if session token is leaked (logged on customer server, intercepted in-flight, etc.), attacker has permanent access until session expires. No password to reset.

**Mitigation:** session_ttl bounded (initial: 30 days for guest, 90 days for registered); customer-side guidance to bind guest accounts to App Store / Google Play account ID for recovery; vault-recommended pattern docs for customer SDK integration; consider device-fingerprint-binding on session as future hardening.

### F3 — Customer logs player credentials in transit

Owned-auth flow proxies player login through customer-developer's server (player → customer server → BokChoy). Customer could (accidentally or maliciously) log credentials. BokChoy can't prevent this directly.

**Mitigation:** SDK security guidance docs explicitly call out credential-non-logging requirement; DPA includes flow-down obligation; security questionnaire asks customer to attest credential handling. Risk is real but bounded — customer has every incentive to protect credentials (their players, their reputation). Pattern is industry-standard (this is how PlayFab/Unity owned-auth flows work too).

### F4 — Customer flags `is_child_directed = FALSE` when audience is actually mixed

Customer mis-declares project audience; BokChoy doesn't apply COPPA restrictions; FTC enforcement risk lands on customer (operator), but BokChoy could be drawn in as a third-party in the investigation per Apitor pattern.

**Mitigation:** customer attests on project creation + DPA + COPPA written-assurance template; BokChoy is contractually shielded from operator obligations on customer's misdeclaration. Industry-standard pattern per Unity GS guidance ("It is your responsibility to ensure your App-level and User-level age designations are set up accurately"). BokChoy reserves audit cooperation right + project-suspension right on FTC notice.

### F5 — Cross-tenant player record bleed under RLS regression

Per `[[multi-tenant-rls-research]]` 8a-c failure modes (leakproof regression, owner bypass, context-bleed), an RLS regression could expose Customer A's player records to Customer B.

**Mitigation:** existing RLS infrastructure + CI lint per `[[wallet-mechanics]]` cascade (RLS presence on every protected table) + leakproof regression test in CI — extend existing patterns to `players` table on creation. No additional mechanism beyond existing.

### F6 — `bokchoy_app` role over-grants on PII columns

If `bokchoy_app` role inadvertently has direct UPDATE on `email` or `password_hash` columns (vs. EXECUTE-only on stored-function interface per `[[wallet-mechanics]]` M2), an SQL injection or compromised app credential could bulk-extract PII.

**Mitigation:** column-level GRANT (`GRANT SELECT (id, project_id, created_at, last_login_at) ON players TO bokchoy_app` — explicit columns, no email or password_hash); all PII access via M2 stored functions only; CI lint extends `[[wallet-mechanics]]` discipline to player tables.

### F7 — DSR export flooding (denial-of-service via legitimate-looking DSAR requests)

Adversary triggers high volume of DSR-export operations across many player_ids; Postgres CPU/IO saturated.

**Mitigation:** rate-limiter on `player_export` per project + per IP; async export pattern (queue export, deliver result async via signed URL); customer-portal-only access (DSAR exports flow through customer UI, not direct API); priority queue separation between player auth (sync, latency-sensitive) and DSR (async, bulk).

## Mitigations

(captured inline per failure mode above; aggregated for runbook reference at implementation phase)

- Rate-limiter values are initial — operational data triggers revisit
- CI lint discipline extends `[[wallet-mechanics]]` and `[[multi-tenant-rls-research]]` patterns to player tables on schema creation
- Customer-onboarding docs include security guidance (F3 credential handling, F2 recovery patterns, F4 audience flagging)
- Async DSR export pattern — implementation phase task
- Pre-implementation security review of player auth endpoints (cascade obligation; analogous to `[[loot-rng-construction]]` canonicalization review)

## Idiom citations

None — language-stack-specific idioms (TS / Go / etc.) deferred to library + language decision (next decision in queue per state.md). Argon2id parameter choices, session-token format (opaque vs JWT), and rate-limiter implementation are all stack-conditional.

## Revisit when

- **Pass-through reopens:** first paying customer with a live game (existing player base) requests pass-through integration. Re-derive: cost of building JWKS-validation + claim-mapping + key-rotation coordination vs. customer revenue from that integration.
- **Cross-project player portability:** any product feature crosses the joint-controller line per EDPB 07/2020 (cross-customer player linking, BokChoy-as-identity-provider across games, cross-customer analytics on player behavior) — re-derive controller/processor analysis.
- **PII scope expansion:** any product surface requires profile fields in BokChoy's DB (cockpit live-ops UI ships display names natively, SDK ships UI components, customer demand for BokChoy-managed leaderboards-with-avatars). Re-derive (i)/(ii) fork.
- **Age-gate reopens:** legal-infra cost on COPPA written-assurance template is materially higher than estimated (>4 weeks team time, >$15K legal review), AND family-aimed customer slice is <10% of pipeline. Re-derive D/E tradeoff.
- **Controller-stance reopens:** BokChoy ships any feature using cross-customer player data (analytics improvement, ML training, ad-network monetization). Re-derive controller analysis for that feature; may flip stance for that activity.
- **2025 COPPA "written assurances" template** crystallizes in industry practice (~6-12 months post-2025-04-22 amendments) — update DPA template to match emerging norm. Open thread per `[[auth-compliance-research]]` open-thread 4.
- **Cascade obligation:** verify Supabase encryption-at-rest is enabled by default; document in `[[host-platform]]` cascade list.
