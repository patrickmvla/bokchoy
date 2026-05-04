---
type: research
features: [design-doc-audit]
related: ["[[design-claims-register]]", "[[cockpit-gap-research]]", "[[slice-cell-research]]", "[[sales-cycle-research]]", "[[structural-moat-research]]"]
created: 2026-04-30
confidence: high
provisional: false
---

# Is "30-minute integration with PlayFab / Nakama / UGS" technically and politically achievable?

Resolves **CL-006** in [[design-claims-register]].

## Question

DESIGN.md §10 claims *"30-minute integration, not 3 days"* as the wedge — and §17 builds GTM on partnership-led acquisition through Heroic Labs / Unity / RevenueCat. CL-006 has two halves: (a) **technical** — can a studio engineer actually wire BokChoy + their existing BaaS in 30 minutes? (b) **political** — will Microsoft (PlayFab), Unity (UGS), and Heroic Labs (Nakama) actively keep that bridge open, or are the partnership claims at risk?

## Triangulation

- **Production reference:** ✓ — PlayFab REST authentication APIs documentation, Nakama server-to-server runtime examples + custom-auth docs, UGS Cloud Code limits + integration docs, Google Play Games Services v1 → v2 SDK deprecation as real-world breakage case. Heroic Labs Hiro framework cross-referenced from [[slice-cell-research]].
- **Docs reference:** ✓ — current vendor docs across all three platforms, version-pinned where possible.
- **Contradiction probe:** ✓ — actively searched for cases where BaaS platforms have deprecated or rate-limited third-party integrations. Found: Google PGS v1 SDK deprecation 2025. Cross-referenced GitHub-Dependabot from [[structural-moat-research]] as the "platform absorbed the third-party integration surface" pattern.

## Sources examined

### Source 1 — PlayFab authentication APIs
- **Tier:** 2 (official docs)
- **Provenance:** `learn.microsoft.com/en-us/rest/api/playfab/server/authentication/authenticate-session-ticket?view=playfab-rest`, `learn.microsoft.com/en-us/rest/api/playfab/client/authentication/login-with-openid-connect?view=playfab-rest`, `learn.microsoft.com/en-us/rest/api/playfab/client/account-management/link-openid-connect?view=playfab-rest`. Current Microsoft Learn docs.
- **Author context:** Microsoft / PlayFab product team docs.
- **What it tells us:** PlayFab supports: (a) `Authenticate Session Ticket` REST API for server-side validation of client tickets; (b) `Login With OpenId Connect` for JWT-based auth with external IdP; (c) `Link OpenId Connect` for linking external account to existing PlayFab user. Per a community thread cited in search synthesis: *"OAuth tokens used with PlayFab can authorize users to other backend cloud platforms as needed, allowing for a centralized security design."* — i.e., the integration pattern BokChoy needs is *explicitly documented* and supported. **Technical: feasible at the auth-bridge layer.**

### Source 2 — Okta + Unity WebGL + PlayFab tutorial
- **Tier:** 4 (named-author tutorial, recent)
- **Provenance:** `developer.okta.com/blog/2021/02/26/unity-webgl-playfab-authorization`. Title *"Unity WebGL + PlayFab Authorization in 20 Minutes"*. Published 2021.
- **Author context:** Okta developer-relations blog. Working code, third-party developer perspective.
- **What it tells us:** A working Okta-to-PlayFab auth bridge can be built in **~20 minutes**. This is the auth bridge *only*, not a full integration with economy state sync. Validates that the 30-min figure in DESIGN.md §10 is **achievable for the auth-bridge slice**. Does not validate that a full economy integration (catalog, wallet, inventory state sync, webhook delivery for offer triggers) can land in 30 min — that's a different, larger surface.

### Source 3 — Nakama server-to-server runtime + custom-auth docs
- **Tier:** 2 (official docs)
- **Provenance:** `heroiclabs.com/docs/nakama/guides/concepts/custom-authentication/`, `heroiclabs.com/docs/nakama/server-framework/runtime-examples/server-to-server/`. Current.
- **Author context:** Heroic Labs / Nakama team.
- **What it tells us:** Server-to-server via **RPC hook + Runtime HTTP Key**. Third-party JWT auth explicitly documented: *"hook in to an existing third-party API to both validate the user and retrieve their metadata. This metadata can then be used to create an associated user in Nakama, effectively linking their external User ID / Username to a Nakama user."* Server-side logic available in Go / TypeScript / Lua. **Technical: most permissive of the three platforms for the BokChoy integration pattern.** Nakama is open-source self-hostable, so even if Heroic refused partnership, the runtime is technically open.

### Source 4 — Unity GS Cloud Code limits and integration docs
- **Tier:** 2 (official docs)
- **Provenance:** `docs.unity.com/en-us/cloud-code/modules/reference/limits`, `docs.unity.com/en-us/cloud-code/modules/how-to-guides/unity-services-integration`. Current.
- **Author context:** Unity product team.
- **What it tells us:** Cloud Code constraints: **scripts ≤ 128 KB, request body ≤ 1 MB, 256 MB worker memory, 600 req/min per player (10 req/s), 12k req/min per service account (200 req/s)**. Modules can call external REST APIs via the Cloud Code C# SDK or directly. **Technical: feasible with constraints.** The script-size and memory limits could bite for a BokChoy integration that needs to translate large catalog payloads or maintain in-memory state — both are likely. The rate limits (10 req/s per player) are not problematic for typical economy interactions, but bulk operations or analytics fetches might.

### Source 5 — RevenueCat + PlayFab integration as integration-pattern reference
- **Tier:** 2 + 4 (vendor docs + tutorial content)
- **Provenance:** `revenuecat.com/docs/getting-started/installation/unity`, `learn.microsoft.com/en-us/gaming/playfab/sdks/unity3d/quickstart`, `github.com/RevenueCat/purchases-unity`. Current.
- **Author context:** RevenueCat + PlayFab product teams.
- **What it tells us:** RevenueCat ships a Unity SDK. PlayFab ships a Unity SDK. **No public combined integration tutorial** — no canonical "RevenueCat + PlayFab in 30 minutes" exists from either vendor. This is signal: even between two well-known third-party services, the integration pattern is *not* a packaged 30-min recipe; it's an engineering effort the customer assembles. BokChoy's claim of 30-min integration with multiple BaaS is more aggressive than the established cross-vendor pattern.

### Source 6 — Google Play Games Services v1 → v2 SDK deprecation (concrete breakage case)
- **Tier:** 2 (official Android docs)
- **Provenance:** `developer.android.com/games/pgs/migration_overview`, surfaced in WebSearch synthesis on BaaS deprecation. **2025 deprecation announced.**
- **Author context:** Google Play product team — official deprecation notice.
- **What it tells us:** *"Google Play Games Services, games v1 SDK relies on Google Sign-In for Android which is deprecated and will be removed from the Google Play services Auth SDK (com.google.android.gms:play-services-auth) in 2025."* Studios using Google Play Games Services v1 must migrate to v2 to avoid breakage. **Concrete real-world example:** platform-controlled SDK changes force third-party integration migration. BokChoy depending on PlayFab / UGS / Nakama integration surfaces faces the equivalent risk if any of those platforms deprecate or restructure their auth APIs.

### Source 7 — Heroic Labs Hiro framework (cross-reference from [[slice-cell-research]] Source 4)
- **Tier:** 2 (vendor docs)
- **Provenance:** `heroiclabs.com/docs/hiro/concepts/introduction/`. Current.
- **What it tells us for CL-006:** Heroic ships **Hiro** — a Nakama metagame framework with wallet/inventory/shop/rewards/mailbox. **The complement BokChoy claims to provide for Nakama is exactly what Hiro is.** Heroic's commercial incentive is to push Hiro to Nakama customers, not to channel-partner with BokChoy. The DESIGN.md §10 claim *"Active partnership with Heroic Labs"* requires evidence beyond assertion to survive — and the existence of Hiro is direct evidence against it.

## Findings

### Technical feasibility — feasible at the auth-bridge layer; misleading at the full-integration layer

DESIGN.md §10 says *"30-minute integration, not 3 days."* What's actually a 30-min job:

| Surface | Realistic time | Source |
|---|---|---|
| **Auth bridge only** (PlayFab session ticket → BokChoy session JWT, OR Nakama RPC custom-auth, OR UGS Cloud Code REST call) | **20–30 minutes** for an experienced engineer following docs | Source 2 (Okta + PlayFab + Unity tutorial: 20 min) |
| **Auth bridge + simple economy state read** (display PlayFab inventory in BokChoy, or vice versa) | **2–6 hours** for an experienced engineer | Inferred from Sources 1, 3, 4 + standard SDK integration patterns |
| **Full economy integration** (auth + catalog versioning + wallet sync + inventory state sync + webhook delivery for offers + transaction reconciliation between BokChoy and BaaS) | **1–3 engineer-days** at minimum, more with debugging | Inferred + comparison with RevenueCat + PlayFab pattern (Source 5) which has no canonical 30-min recipe across vendors |
| **Production-hardened integration** (idempotency, retry policy, error handling, observability, performance tuning) | **1–2 engineer-weeks** | Standard production-readiness engineering |

The DESIGN.md figure is **the auth-bridge layer alone**. That's a real 30-min job, but it's not what a customer needs to ship a game on BokChoy alongside an existing BaaS. The "30 min" framing is technically defensible but commercially misleading — a studio reading §10 will expect the full thing, not the 30-min hello-world.

### Political feasibility — Heroic damaged; Microsoft / Unity neutral-but-not-endorsing

Per the cumulative findings of [[slice-cell-research]] and [[structural-moat-research]], expanded with this entry's evidence:

| Platform | Posture toward BokChoy integration | Confidence | Rationale |
|---|---|---|---|
| **Heroic Labs (Nakama)** | **Damaged** — they ship Hiro themselves | High | Source 7. Heroic's commercial incentive is to sell Hiro, not channel-partner with a Hiro alternative. The DESIGN.md §10 / §17 *"active partnership"* claim has no evidence basis. |
| **Microsoft (PlayFab)** | **Neutral but not endorsing** | Medium-high | PlayFab supports OpenID Connect / OAuth integration explicitly (Source 1) — they don't *block* third-party. But Foundation Mode at GDC 2026 makes core PlayFab services free for Xbox devs, increasing PlayFab's own gravitational pull. No public stance on third-party economy alternatives. |
| **Unity (UGS)** | **Neutral but not endorsing** | Medium-high | UGS Cloud Code allows external REST calls (Source 4). Unity Asset Store could host a BokChoy integration. But Unity ships UGS Economy + Game Overrides themselves; they don't have a stated channel program for third-party economy specialists. |

**The "active partnership with Heroic Labs" is the most concrete claim in §10 and the most directly contradicted.** Hiro shipping is direct evidence against. Without Heroic's active recommendation, the partnership-led acquisition motion in §17 has one fewer channel — and the most-cited one is the broken one.

### SDK deprecation risk is concrete

Google PGS v1 SDK deprecation 2025 (Source 6) is the canonical pattern: platform changes auth surface, third-party integrations require migration or break. **Microsoft, Unity, Heroic could each ship breaking changes that force BokChoy to maintain compatibility shims.** The cost is not catastrophic (it's the cost of running a multi-platform integration product) but it is recurring engineering overhead that DESIGN.md §11 / §14 do not budget for.

The deeper risk per [[structural-moat-research]] is the GitHub/Dependabot pattern: the integration surface is the *on-ramp* for the platform to absorb the function. If PlayFab v3 ships native equivalents of BokChoy's wedge features, customers using the BokChoy bridge are exactly the customers PlayFab will steer toward native.

### Anti-default — the strongest counter-argument

*"Heroic could partner with BokChoy because Hiro is thin and BokChoy is deep — Heroic might prefer to point customers at the deeper specialist for AAA needs while keeping Hiro for indie."*

This is plausible but unverified. The contrarian survives only if Heroic publicly signals it. The DESIGN.md §10 *"active partnership"* phrasing implies it's already happening; there's no public evidence in this research pass that it is. Either there's evidence I haven't surfaced (in which case design should produce it) or the claim should be downgraded to "partnership candidate, not yet active."

## Conflicts

| Conflict | Source A | Source B | Precedence applied |
|---|---|---|---|
| DESIGN.md §10 *"30-minute integration"* | DESIGN.md | Source 2 (auth-bridge ~20 min) + Source 5 (no canonical full-integration recipe across vendors) | **Both partially correct.** The 30-min figure is true at the auth-bridge layer. False at the full-integration layer. The framing is misleading because customers will read it as full integration. |
| DESIGN.md §10 *"Active partnership with Heroic Labs"* | DESIGN.md | Source 7 (Hiro shipping) | **Hiro shipping wins.** Heroic competes on the wedge BokChoy claims. "Active partnership" is unverified by any public signal in this pass. |
| §10 implies platform stability for integrations | DESIGN.md | Source 6 (Google PGS v1 deprecation) | **Real-world deprecation case wins.** Platform-controlled SDK changes are a recurring risk; DESIGN.md should budget for it. |

## Conditions

This finding holds under:
- **Time:** April 2026.
- **Vendors:** PlayFab, Unity GS, Nakama. Other BaaS (AccelByte, Beamable, Metaplay) not investigated for integration depth — though [[cockpit-gap-research]] showed all of them ship overlapping features; integration into them is more "compete" than "complement."
- **Definition of integration:** the technical surface for *one studio engineer* connecting BokChoy to their existing BaaS. Not the partnership / co-marketing / sample-project investment between BokChoy and the BaaS vendors — that's a separate (slower, more expensive) effort.

Does **not** hold for:
- The pricing-and-incentive question of "would platform X actively keep BokChoy in their channel" — that's a commercial / partnership investment question requiring founder-level conversations, not desk research.
- Long-term integration health under platform major-version changes — would require a longitudinal study; we have one named example (Google PGS) but the rate per BaaS-per-decade is unknown.

## Operational implications

For design's wedge rework:

1. **§10 "30-minute integration" should be downgraded to "30-minute auth bridge; 1–3 day full integration."** The current framing is technically defensible at the auth layer but oversells. Honest framing builds credibility with the engineering buyers who will eventually scrutinize it.

2. **§10 "Active partnership with Heroic Labs" must be backed by evidence or removed.** Hiro shipping is direct evidence against partnership in the current configuration. Either: (a) produce Heroic-side public statement of partnership; or (b) reframe to "partnership candidate, conversation in progress, gated on Hiro depth-comparison."

3. **§17 partnership-led acquisition motion should account for at least one channel partner being actively competitive.** Heroic shipping Hiro doesn't preclude a partnership but it changes the shape — Heroic is more likely to share customers than refer them. Realistic GTM: founder-led + content-led + greenfield (per [[sales-cycle-research]] implications) carry more weight than partnership-led at Year 1–2.

4. **§11 / §14 should budget engineering overhead for SDK deprecation maintenance.** Real-world example exists. The cost is not crippling but it's not zero.

5. **Cumulative damage to §10 / §17:**
   - 30-min integration framing: misleading
   - Heroic partnership: directly contradicted by Hiro
   - SDK breakage risk: real
   - Channel partnership stability: medium uncertainty across all three platforms

6. **The technical layer of CL-006 supports a specific reframed wedge:** *"BokChoy integrates with whatever BaaS the studio already uses, with same-day implementation for the auth bridge and a multi-day path to full integration."* This is honest and defensible — and it's a different commercial promise than "30-minute integration." The reframed wedge fits the honest version of the cumulative cockpit + slice + cycle + moat story (per the prior four research entries): BokChoy as a quality competitor in the existing specialist tier, with credible integration depth for studios who want a focused economy module on top of their existing BaaS.

## Reproducibility note

Reproducible. Another investigator with the same question and access to WebSearch / WebFetch should reach a similar finding by:
1. Reading PlayFab REST authentication docs for OpenID Connect / session-ticket APIs.
2. Reading Nakama server-to-server runtime + custom-auth docs.
3. Reading UGS Cloud Code limits and integration docs.
4. Cross-referencing against Hiro framework docs and Google PGS deprecation notice.
5. Searching for canonical "X + Y in 30 minutes" tutorials between named cross-vendor integrations.

Subjective judgment: minimal at the technical layer (the docs are explicit). Higher at the political layer — *"Heroic's posture toward BokChoy"* requires inference from public artifacts; another investigator might rate the partnership as 30% rescuable rather than 0%.

## Open threads

- **AccelByte integration story.** [[slice-cell-research]] surfaced AccelByte as a candidate B1 incumbent; CL-006 didn't investigate whether AccelByte exposes the integration surfaces BokChoy would need. If B1 stays a candidate slice, AccelByte's posture is the next thing to know.
- **Beamable / Metaplay / Balancy integration paths.** These are competitors per [[cockpit-gap-research]], not partners — but if a wedge rework chooses "we are *one of* the specialists, not *the* specialist," BokChoy might integrate *with* them in some cases. Worth knowing what each platform exposes.
- **Founder-level partnership outreach.** Park-equivalent — desk research can't settle whether Heroic / Microsoft / Unity will actively channel-partner. Founder conversation is required.
- **All top-5 CLs from the register are now resolved.** Open queue: P2 architectural-decision derivation work (CL-014 through CL-037), §16 pricing math (CL-038–CL-042), §17 GTM motion (CL-043–CL-046), §18 competitive landscape per-vendor cells (CL-013 partially resolved; per-vendor cell rewrites needed), §20 risk likelihood numbers. Plus PK-* park items requiring customer discovery, plus CL-003 founder credibility decision owed back to design.
