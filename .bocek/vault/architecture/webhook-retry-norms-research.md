---
type: research
features: [wallet, architecture, outbox, webhooks]
related: ["[[wallet-mechanics]]", "[[idempotency-strategy]]", "[[design-claims-register]]"]
created: 2026-05-02
confidence: high
provisional: false
---

# Webhook retry policy norms across Stripe, Shopify, Twilio, GitHub, Slack — where does BokChoy's 4.3-min / 8-attempt draft sit on the production spectrum?

## Question

Does BokChoy's `webhook_fire = 8 attempts / ~256 sec` draft in `[[wallet-mechanics]]` §4 sit defensibly within the production-cited spectrum of B2B webhook retry policies, and what conditions does the chosen position require to be operationally sound? The amendment to `[[wallet-mechanics]]` needs evidence-backed reasoning attached to the per-kind `max_attempts` policy — currently labeled "initial values, my judgment" with no production cite.

## Triangulation

- **Production reference:** ✓ — Stripe (`docs.stripe.com/webhooks`), Shopify (`shopify.dev/docs/apps/build/webhooks/troubleshooting-webhooks` + 2024-09-10 changelog), Twilio (`twilio.com/docs/usage/webhooks/webhooks-connection-overrides`), GitHub (`docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries`), Slack (`docs.slack.dev/apis/events-api/`)
- **Docs reference:** ✓ — five named platforms above, all primary first-party docs retrieved 2026-05-02
- **Contradiction probe:** ✓ — Gusto Embedded engineering post-mortem (2025, "Surviving Retry Storms"), retrieved from search snippets only because the primary URL returned 403. Primary URL: `embedded.gusto.com/blog/retry-storms-webhook-queue-latency/`. The Gusto incident is the named failure mode that long retry tails create in multi-tenant systems — directly relevant to BokChoy's posture. Additionally, Shopify's 2024-09-10 changelog tightening retries from 19/48h to 8/4h is a first-party admission that long policies have operational cost.

## Sources examined

### Source 1 — Stripe webhook retry docs
- **Tier:** 2 (official docs)
- **Provenance:** `https://docs.stripe.com/webhooks`, `https://docs.stripe.com/billing/subscriptions/webhooks`, `https://docs.stripe.com/webhooks/process-undelivered-events` (accessed 2026-05-02; pages unversioned)
- **Author context:** Stripe Inc., canonical reference for Stripe's webhook delivery contract
- **What it tells us:** "Stripe attempts to deliver events to your destination for up to three days with an exponential back off in live mode." Manual replay via Dashboard ≤15 days, via CLI ≤30 days. Endpoint auto-disabled after sustained failure but events remain queryable via List Events for 30 days. The widely-cited "16 attempts" figure is **not** in current first-party Stripe docs; community-attested only.

### Source 2 — Shopify webhook retry docs + changelog
- **Tier:** 2 (official docs) + 3 (changelog as effectively a versioned post-mortem on the prior policy)
- **Provenance:** `https://shopify.dev/docs/apps/build/webhooks/troubleshooting-webhooks`; changelog `https://shopify.dev/changelog/updates-to-webhook-retry-mechanism` dated **2024-09-10** (accessed 2026-05-02)
- **Author context:** Shopify Inc.
- **What it tells us:** "Webhooks will now be retried a total of 8 times over 4 hours using an exponential backoff schedule." Subscription is **removed** after persistent failure within 24 hours. **No documented manual replay tooling** in primary docs — recreating the subscription is the only recovery path. The 2024 changelog explicitly tightened a prior 19-attempt / 48-hour policy.

### Source 3 — Twilio webhook connection overrides
- **Tier:** 2 (official docs)
- **Provenance:** `https://www.twilio.com/docs/usage/webhooks/webhooks-connection-overrides` (accessed 2026-05-02)
- **Author context:** Twilio Inc.
- **What it tells us:** Configurable per-call `attempt` parameter, **min 0, max 5, default 1**. 15-second hard ceiling on call-related HTTP. `I-Twilio-Idempotency-Token` header distinguishes retries. Twilio's per-product (Messaging, Voice status-callback) retry counts are **not** in first-party docs retrieved this session; treated as a documentation gap, not a missing policy.

### Source 4 — GitHub webhook delivery + redelivery docs
- **Tier:** 2 (official docs)
- **Provenance:** `https://docs.github.com/en/webhooks/using-webhooks/handling-failed-webhook-deliveries`, `https://docs.github.com/en/webhooks/testing-and-troubleshooting-webhooks/redelivering-webhooks`, `https://docs.github.com/en/webhooks/using-webhooks/automatically-redelivering-failed-deliveries-for-a-repository-webhook` (accessed 2026-05-02)
- **Author context:** GitHub (Microsoft)
- **What it tells us:** **"GitHub does not automatically redeliver failed webhook deliveries."** 10-second response timeout. Manual redelivery via REST/UI within **3-day window**. Sample auto-redelivery workflow uses `'20 */6 * * *'` cron with 24-hour lookback. GitHub is the outlier — zero automatic retries, betting on its delivery-history API + queryable-resource state model.

### Source 5 — Slack Events API retry docs
- **Tier:** 2 (official docs)
- **Provenance:** `https://docs.slack.dev/apis/events-api/` (302 from `api.slack.com/apis/events-api`, accessed 2026-05-02)
- **Author context:** Slack (Salesforce)
- **What it tells us:** **3 retries** on a fixed schedule (~immediate, +1 min, +5 min) — total ~6-minute window. No dead-letter; events are dropped after attempt 3 unless the optional Delayed Events extension is enabled (hourly retries for 24h). Headers: `x-slack-retry-num`, `x-slack-retry-reason`. Receivers can opt out per-event via `x-slack-no-retry: 1`.

### Source 6 — Gusto Embedded retry-storm post-mortem (CONTRADICTION PROBE)
- **Tier:** 3 (engineering post-mortem) — **degraded** to between 3 and 6 because the primary URL returned 403; content reconstructed from search-result snippets
- **Provenance:** `https://embedded.gusto.com/blog/retry-storms-webhook-queue-latency/` (returned 403 to fetcher, 2026-05-02; quoted via search-result excerpts only)
- **Author context:** Gusto Embedded engineering team, ~2025; multi-tenant payroll/HR API platform
- **What it tells us:** A small number of broken customer endpoints generated retry backlog that pushed the central Notifications queue past its 60-second SLO, **degrading delivery for healthy customers** — classic noisy-neighbor amplification. Fix: Redis sliding-window failure-rate limiter that auto-deactivates subscriptions exceeding a threshold within 5-minute windows. Reported result: **~20× reduction in delivery failure rate** after deployment. **Caveat:** the auto-deactivation was at time of writing only enabled for demo subscriptions, not production.

## Findings

### Pattern A — long-window passive delivery (Stripe, Shopify)
Stripe (3 days, ~16 attempts in community sources) and Shopify (4 hours, 8 attempts) bracket the **asynchronous-business-event cluster**. Both use exponential backoff. Both terminate by disabling the subscription rather than silently dropping. Stripe couples this with manual replay tooling (15-day Dashboard, 30-day CLI, plus List Events API). Shopify does not document equivalent replay tooling — subscription-disable is the dead-letter and recovery is by re-subscription.

Per Sources 1–2.

### Pattern B — short-window with explicit replay or no-retry-with-replay (Slack, GitHub)
Slack (6 min, 3 attempts) and GitHub (no auto-retry, 3-day manual redelivery) sit at the short end. Slack drops events at attempt 3; GitHub never retries automatically. Both bet that the receiver will either (a) be available within the short window (Slack) or (b) be able to reconstruct events from queryable canonical state (GitHub).

Per Sources 4–5.

### Pattern C — sub-call synchronous (Twilio)
Twilio's voice/SMS webhooks are tied to in-flight calls; the 15-second hard ceiling is a real-time constraint, not a retry policy choice. Connection-overrides allow 0–5 attempts within the call window. This is a different problem class from BokChoy's (BokChoy events are not synchronously tied to a player session in the same way).

Per Source 3.

### Modal observation
Among "asynchronous business event" platforms (Pattern A + B excluding Twilio's special case), **the modal cluster is hours-to-days, not minutes**. Shopify (4h) and Stripe (3d) bracket the cluster. There is no modal value in attempt count — 3, 5, 8, 16 are all represented; attempt count is a function of total window divided by chosen backoff base, not a directly tuned parameter.

**BokChoy's draft (8 attempts / ~256s = ~4.3 min)** is roughly **56× shorter than Shopify** and **~1000× shorter than Stripe** on the wall-clock dimension while matching Shopify's attempt count. Position: **short end** of the asynchronous-business-event cluster, near Slack but with longer absolute window and more attempts.

### Tradeoff that the spectrum encodes
The retry window is fundamentally **a redistribution of who carries the cost of receiver downtime**:
- **Long window** = sender carries it (queue depth, operational complexity, retry-storm risk).
- **Short window + replay** = receiver carries it (monitoring, backfill code).
- **GitHub model** = receiver carries all of it, with safety net that canonical state is queryable.

The Gusto 2025 incident demonstrates **the dominant failure mode of long-window policies in multi-tenant systems**: a small number of broken receivers generate retry backlog that degrades delivery for healthy receivers. Shopify's 2024 tightening (19/48h → 8/4h) is first-party evidence that the long-window cost was real enough at Shopify scale to motivate a policy change.

Per Source 6 + Source 2 changelog.

## Conflicts

No primary-source conflicts on first-party retry mechanics. The following weaker-source contradictions surfaced and are recorded honestly:

1. **Stripe "16 attempts."** Widely repeated by Svix / Hookdeck / EventDock community write-ups but not in current first-party Stripe docs. The 3-day window and exponential shape are first-party-confirmed; the attempt count is community-attested. Per *Contradiction protocol* (production code/docs > community), the count is **not citation-grade**; the window is.

2. **Shopify pre-2024 policy (19 attempts / 48 hours).** Pre-changelog community references describe the older policy. The 2024-09-10 changelog explicitly supersedes it. Use only the post-changelog policy when citing.

3. **No publicly named, dated post-mortem on the OPPOSITE failure mode** (too-short window causing lost events) was findable in this session. The closest pattern is recurring complaints that Shopify subscription-removal-on-failure leaves apps silently disconnected — that is a **dead-letter consequence**, not strictly a too-short retry consequence. The asymmetry is itself a finding: the documented multi-tenant pain is retry storms (Gusto), not lost events from short windows.

## Conditions

The findings hold under these conditions:

- **Asynchronous business-event delivery** (state-sync between systems) is the relevant problem class. Sub-call real-time delivery (Twilio voice) and large-payload streaming are different problem classes with different normative policies.
- **Multi-tenant sender** with heterogeneous receiver quality is the operational context where the Gusto failure mode applies. Single-tenant or tightly-controlled-receiver environments don't see the noisy-neighbor amplification at the same severity.
- **Retry policy is one of several mechanisms.** Per-subscription failure-rate limiting (Gusto's auto-deactivation), endpoint health monitoring, and replay tooling are cooperating mechanisms; the retry policy alone is insufficient regardless of where on the spectrum it sits.
- **Findings are docs-current as of 2026-05-02.** Stripe and Shopify in particular update policies; treat retry-policy claims as freshness-sensitive.

## Operational implications

For `[[wallet-mechanics]]` §4 `webhook_fire = 8` decision:

1. **The 4.3-min / 8-attempt draft is defensible but CONDITIONAL.** It encodes the "operator's posture" choice (short window + receiver carries replay burden), which the Gusto incident retroactively validates as the correct posture for a multi-tenant system. The position is *not* the safest universal default — Shopify and Stripe pick the opposite — but it is *internally consistent* with BokChoy's other choices (multi-tenant Postgres, single sender, customer-attributed receiver responsibility).

2. **Three deliverables the wallet-mechanics entry currently does NOT name, which the position requires:**
   - **(a) List-failed-deliveries API.** Stripe-style. Without this, customers cannot recover from a >5-minute outage and the position becomes "we lose your events." Required, not optional.
   - **(b) Per-subscription failure-rate limiter / auto-deactivation.** Gusto's lesson directly. A single broken customer endpoint must not degrade delivery for healthy customers. The mechanism (5-min sliding window + threshold + auto-disable + customer notification) is what makes the short-window choice safe at multi-tenant scale.
   - **(c) Dead-letter durability ≥7 days.** Customers must be able to recover from a weekend outage. The current `staged_jobs` schema retains `'dead'` status rows but the entry doesn't name the retention floor. 7 days minimum, 30 days matching Stripe is stronger.

3. **The "policy comment" amendment to `[[wallet-mechanics]]` should be:**
   > `webhook_fire = 8` (~4.3 min total). Encodes operator-posture choice: short window with explicit customer replay, against long-window-passive (Stripe 3d, Shopify 4h). Position validated by Gusto 2025 retry-storm post-mortem — long tails generate cross-tenant noisy-neighbor failures in multi-tenant systems. Conditional on (a) list-failed-deliveries API, (b) per-subscription failure-rate limiter, (c) dead-letter retention ≥7 days. Revisit after first 30 days production traffic per `[[runbook-idempotency]]`.

4. **Other `max_attempts` values:**
   - `mailbox_push = 5` (~62 sec): internal infrastructure target, defensible without further evidence.
   - `iap_receipt_validate = 5` (~31 sec): **needs Apple/Google receipt-validation outage history** to justify dead-letter-vs-extended-retry. This is Q4 from the prior research handoff, deferred non-blocking. Current value is reasonable initial choice.
   - `analytics_event = 3` (~7 sec): "wallet correctness > analytics fidelity during traffic spikes" is the policy choice; encode it explicitly.

## Reproducibility note

**Reproducible:** clone or fetch the five primary doc URLs (Stripe webhooks, Shopify troubleshooting + 2024-09-10 changelog, Twilio connection-overrides, GitHub failed-deliveries + redelivering, Slack Events API), extract the retry-policy section, build the per-system table. The Gusto post-mortem requires browser access (the URL 403'd to the fetcher); content was reconstructed from search snippets and is correspondingly weaker. Re-verify any specific Gusto numbers (60s SLO, 5-min window, 20× failure-rate reduction) by reading the post directly before externally citing.

Honest gaps:
- Stripe attempt count (~16) is community-attested only.
- Twilio per-product retry counts (Messaging status callback, Voice status callback) not findable in first-party docs this session.
- Slack interval verbatim ("1 minute / 5 minutes") was paraphrased by the doc page returned to the fetcher, not literal HTML — high confidence but not direct.
- Q4 (Apple/Google IAP outage history) intentionally deferred; non-blocking.

## Open threads

1. **Apple/Google IAP receipt-validation outage history** — required to justify or revise `iap_receipt_validate = 5`. Apple has had named multi-hour outages historically; specific incident dates + MTTR would let the value be defended explicitly. Q4 from prior handoff, non-blocking.

2. **List-failed-deliveries API contract** — what's the BokChoy-specific shape? Stripe's `events?delivery_success=false` + `?limit=N` is the model. This is a design decision flowing from this finding, not further research.

3. **Per-subscription failure-rate limiter design** — Gusto's 5-min sliding window + threshold is the cited mechanism. Specific threshold (failure rate, consecutive failures, window length) needs design rather than research.

4. **Apple/Google receipt-validation outage post-mortems** — same as #1 above, restated as research thread.
