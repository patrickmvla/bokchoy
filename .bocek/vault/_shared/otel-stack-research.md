---
type: research
features: [observability, backend-stack, http-contract]
related: ["[[backend-stack]]", "[[wallet-mechanics]]", "[[wrapper-shape]]", "[[http-contract-research]]", "[[gaps]]"]
created: 2026-05-09
confidence: medium-high
provisional: false
---

# How does OpenTelemetry actually deploy on the Bun + Hono + postgres-js stack today, and what's the realistic exporter target at indie tier?

## Question

For BokChoy slice 8.1 (first wallet HTTP handler) and the broader OTel-wiring obligation in `[[wallet-mechanics]]` Amendment Part 1 A3 (three-layer span emission) + every `@bokchoy/wallet` wrapper's `// TODO(otel)` marker:

- **Q1 (load-bearing constraint):** does `@opentelemetry/sdk-node` work on Bun 1.3+ today, or is the F-Bun-N-class incompatibility named in `[[backend-stack]]` Amendment line 31 still open? If broken, what's the workable substitute?
- **Q2 (Hono coverage):** is there an `@opentelemetry/instrumentation-hono` or first-class Hono OTel package, or is manual instrumentation required?
- **Q3 (postgres-js coverage):** does `@opentelemetry/instrumentation-pg` cover postgres-js (porsager/postgres), or is there a gap?
- **Q4 (exporter target):** Honeycomb vs Grafana Cloud vs self-hosted collector at indie tier — what does free actually buy, what are the discard/limit semantics?

Anti-default declared: the loudest training-data answer is "use OpenTelemetry SDK" — that ducks Q1+Q2+Q3 entirely. The actual decision is whether the auto-instrumentation tooling works on Bun (it doesn't, structurally), and what the manual-instrumentation path looks like.

## Triangulation

- **Production reference:** ✓ — `honojs/middleware/packages/otel/` source-walked (the `@hono/otel` package, first-class Hono org middleware, authored Joakim Lorentz + Hong Minhee); `wataruoguchi/otel-instrumentation-postgres` source-walked (postgres-js community wrapper, v1.0.0 July 2025); Bun open-issue tracker source-walked (#3775, #26536, #28968, #6546, #13165); Sentry's Bun-OTel custom-setup docs (production vendor with paid Bun support).
- **Docs reference:** ✓ — Sentry Bun OpenTelemetry custom setup (`docs.sentry.io/platforms/javascript/guides/bun/opentelemetry/custom-setup/`); OneUptime Bun OTel guide (`oneuptime.com/blog/post/2026-02-06-opentelemetry-bun-without-nodejs-require-flag/view`, named author Nawaz Dhandala, 2026-02-06); Bun discussion #7185 (Jarred-Sumner statement, 2023-11-19); Honeycomb pricing page (`honeycomb.io/pricing`, 2026); Grafana Cloud OTLP docs (`grafana.com/docs/grafana-cloud/send-data/otlp/`).
- **Contradiction probe:** ✓ — actively searched for three contradictions: (a) does `@opentelemetry/sdk-node` work on Bun → conflicting evidence: Datadog says "you can use the OpenTelemetry Node.js SDK" / OneUptime confirms but with caveats / Bun #26536 says auto-instrumentations BROKEN / Sentry sidesteps via direct `NodeTracerProvider` from `@opentelemetry/sdk-trace-node` instead of bundled `sdk-node`. (b) Deno 2.2 shipped native OTel Feb 2025 — Bun has not, despite 2.5+ years of community demand (open issue since 2023-07-24, no maintainer commitment beyond "Maybe" in Nov 2023). (c) SDK package contradiction across guides: Sentry uses `@opentelemetry/sdk-trace-node` + `NodeTracerProvider` directly; OneUptime uses `@opentelemetry/sdk-node` + `NodeSDK` (the bundled all-in-one). Both work for manual instrumentation; the bundled sdk-node includes auto-init helpers + `auto-instrumentations-node` integration that's exactly the path broken on Bun.

## Sources examined

### Source 1 — Bun #3775 (the load-bearing open issue)

- **Tier:** 1 (production code / issue tracker).
- **Provenance:** `github.com/oven-sh/bun/issues/3775`, opened 2023-07-24, **state: open** (observed 2026-05-09, ~2.5 years unfixed).
- **Author context:** Bun OSS issue tracker. Multiple contributors over the issue's lifespan.
- **What it tells us:** "OpenTelemetry doesn't seem to work on Bun" — original report, never resolved. **Bun #26536 (opened 2026-01-28, also open) was auto-flagged as a duplicate** of #3775. Two and a half years of "we haven't fixed this." Issue title at #26536 explicitly: *"Bun doesn't work correctly with Open Telemetry express/fastify/http instrumentation."* The class of problem persists across Hono's transitive HTTP instrumentation.

### Source 2 — Bun #28968 (the proposed native OTel API)

- **Tier:** 1 (production code / issue tracker).
- **Provenance:** `github.com/oven-sh/bun/issues/28968`, opened 2026-04-07, **state: open**.
- **Author context:** Recent proposal for Bun-native OTel auto-instrumentation API.
- **What it tells us:** Title: *"otel: native OpenTelemetry tracing with auto-instrumentation."* Bun is actively proposing native support. **Not shipped.** Confirms the team acknowledges the gap; doesn't fix it today.

### Source 3 — Bun #13165 (shimmer patching breakage at bundle layer)

- **Tier:** 1 (issue tracker).
- **Provenance:** `github.com/oven-sh/bun/issues/13165`, opened 2024-08-08, **state: open**.
- **Author context:** Concrete bug report on a load-bearing OTel mechanism.
- **What it tells us:** *"Shimmer patching breaks on bundled bun code."* Shimmer is the npm package OTel auto-instrumentation uses to monkey-patch HTTP / fs / pg / express / etc. at runtime. Bundle-layer breakage means the patching mechanism itself fails on Bun's bundler output. **This is the structural reason auto-instrumentation doesn't work on Bun** — it's not a config issue; the patching primitive is broken.

### Source 4 — Bun discussion #7185 (Jarred-Sumner's official position)

- **Tier:** 4 (engineering blog / discussion thread).
- **Provenance:** `github.com/oven-sh/bun/discussions/7185`, observed 2026-05-09 via WebFetch.
- **Author context:** Jarred Sumner is the Bun creator. Position dates to 2023-11-19; **no roadmap update visible since**.
- **What it tells us:** Jarred Sumner verbatim (Nov 2023): *"Maybe. I do think a telemetry API is something that a runtime should provide."* No firm commitment, no timeline. Deno 2.2 shipped native OTel Feb 2025 — competitive pressure on Bun is unanswered. Multiple community comments through 2025 confirm "existing Node.js OpenTelemetry libraries don't work reliably with Bun."

### Source 5 — `@hono/otel` source (the workable Hono path)

- **Tier:** 1 (production code).
- **Provenance:** `github.com/honojs/middleware/tree/main/packages/otel`, README + `src/index.ts` source-walked 2026-05-09. Most recent npm version published 2026-03-04.
- **Author context:** Joakim Lorentz + Hong Minhee. Hong Minhee is a known TS production engineer (Fediverse / @hongminhee.org). Hosted under the official `honojs` GitHub org — first-class community package, not third-party.
- **What it tells us:** Hono-middleware approach. Uses `@opentelemetry/api` + `@opentelemetry/sdk-node` (per README example) + `@opentelemetry/exporter-trace-otlp-http`. Source uses `createMiddleware` from `hono/factory` and `routePath` from `hono/route` — pure Hono primitives, no shimmer-style monkey-patching. Captures `ATTR_HTTP_REQUEST_METHOD`, `ATTR_URL_FULL`, `ATTR_HTTP_ROUTE`, `ATTR_HTTP_RESPONSE_STATUS_CODE`, plus configurable request/response headers and a `spanNameFactory` hook. **This is the path that sidesteps Bun's shimmer-patching breakage** because it doesn't depend on shimmer to wrap http/express — it's a Hono middleware that explicitly creates spans via `@opentelemetry/api`. **Limitation called out in README:** *"this instrumentation is based on Hono's middleware system, it instruments the entire request-response lifecycle. This means that it doesn't provide fine-grained instrumentation for individual middleware."* Acceptable for slice 8.1 (single wallet handler) — refine later if cross-middleware spans become load-bearing.

### Source 6 — Sentry's Bun + OTel custom-setup docs

- **Tier:** 2 (official vendor docs).
- **Provenance:** `docs.sentry.io/platforms/javascript/guides/bun/opentelemetry/custom-setup/`, observed 2026-05-09.
- **Author context:** Sentry. Production vendor with paid Bun support. Their docs describe what works in production with their paying customers.
- **What it tells us:** Recommended Bun stack uses `NodeTracerProvider` from `@opentelemetry/sdk-trace-node` (NOT the bundled `@opentelemetry/sdk-node`), plus `@opentelemetry/sdk-trace-base`, `@opentelemetry/exporter-otlp-http`, `@opentelemetry/instrumentation`. Custom setup pattern — they explicitly do NOT use auto-instrumentations-node. Bun-specific caveat: filter out Sentry's own "BunServer integration" when running custom OTel to avoid duplicate spans. **Confirms manual-tracer-provider path works on Bun** — it's the path sidestepping auto-instrumentation.

### Source 7 — OneUptime Bun + OTel guide

- **Tier:** 4 (engineering blog, named author).
- **Provenance:** `oneuptime.com/blog/post/2026-02-06-opentelemetry-bun-without-nodejs-require-flag/view`, author Nawaz Dhandala (@nawazdhandala), 2026-02-06.
- **Author context:** OneUptime is an open-source observability platform. Author is the founder. Production engineering perspective; vendor incentive to make their platform appear easy.
- **What it tells us:** Recommends `@opentelemetry/sdk-node` + `@opentelemetry/auto-instrumentations-node` + `@opentelemetry/exporter-trace-otlp-http`. Programmatic init at top of entry point (no `--require` flag — Bun's module resolution differs). Caveat called out: *"Bun's native APIs (SQLite, etc.) may lack automatic instrumentation and require manual span wrapping."* **Disagrees with Sentry on which SDK package to use** (sdk-node bundled vs sdk-trace-node direct). Both technically work; sdk-node bundles auto-instrumentations-node which is exactly what's broken per Source 3.

### Source 8 — `wataruoguchi/otel-instrumentation-postgres` (postgres-js community wrapper)

- **Tier:** 3 (community-maintained, npm package observed 2025-2026).
- **Provenance:** `github.com/wataruoguchi/otel-instrumentation-postgres`, v1.0.0 released 2025-07-13. 26 commits, MIT.
- **Author context:** wataruoguchi (single maintainer). No corporate affiliation visible. Tier-3 caveat applies — community-maintained without an official backer.
- **What it tells us:** Wraps `postgres.js` (porsager/postgres) clients via `createOTELEmitter()` + `PostgresInstrumentation`. Produces standard OTel attributes: `db.system.name='postgresql'`, `db.query.text`, `db.operation.name`, `db.namespace`. Plus custom attributes for query complexity, parameter counts, clause detection. **Bun support not explicitly tested in surveyed scope** — open thread; needs verification before BokChoy adopts. Alternative community option: `tomsanbear/opentelemetry-instrumentation-postgres` (also targets porsager/postgres, less detailed surveyed).

### Source 9 — Honeycomb pricing 2026

- **Tier:** 2 (official vendor docs / pricing page).
- **Provenance:** `honeycomb.io/pricing`, observed 2026-05-09 (no explicit version date; footer "© 2026 Hound Technology").
- **Author context:** Honeycomb is OTel-native by design (founded by Charity Majors, Christine Yen, Liz Fong-Jones — Charity is the most-cited OTel engineering writer in production circles).
- **What it tells us:** Free tier: **20M events/month**. No service/host limits surfaced. Service-Level Objectives gated to Pro+. 2 triggers free, 100 Pro. SSO Pro+. **OTLP-native** — accepts OTel data without an adapter. At BokChoy indie projection (~3 writes/sec peak) → 3 × 86,400 × 30 = ~7.7M events/month at peak; **well within 20M free**. Studio+ projection (~575 writes/sec) → ~1.5B/month, far over free tier — Pro+ paid required at that scale.

### Source 10 — Grafana Cloud OTLP docs

- **Tier:** 2 (official vendor docs).
- **Provenance:** `grafana.com/docs/grafana-cloud/send-data/otlp/`, observed 2026-05-09.
- **Author context:** Grafana Labs (open-source observability ecosystem; major OTel ecosystem contributor).
- **What it tells us:** Grafana Cloud accepts OTLP-native data. Free tier with managed Tempo (traces) + Loki (logs) + Mimir (metrics). **Concrete limit numbers not pulled in this research session — open thread**. Grafana Cloud Traces enforces ingestion limits to protect shared infrastructure; spans exceeding limits are **discarded** (not buffered or retried). Discard semantics matter for BokChoy's audit-trail invariants (they don't — OTel spans are observability, not audit; the wallet `transactions` table is the audit-of-record).

### Source 11 — Datadog "Instrument Unsupported Runtimes with OpenTelemetry"

- **Tier:** 4 (engineering blog).
- **Provenance:** `docs.datadoghq.com/opentelemetry/guide/instrument_unsupported_runtimes/`, observed 2026-05-09.
- **Author context:** Datadog (commercial APM vendor; sells Bun observability).
- **What it tells us:** *"Bun is compatible with most Node.js APIs, so you can use the OpenTelemetry Node.js SDK to instrument Bun applications."* But: *"default HTTP instrumentation as a dependency not work well. HTTP instrumentation works, but it's not useful given you cannot override the name of the spans."* **Agrees with Bun #26536 finding from a different source channel** — confirms HTTP auto-instrumentation is broken/limited on Bun.

### Source 12 — Bun #6546 (fs instrumentation gap, oldest unfixed)

- **Tier:** 1 (issue tracker).
- **Provenance:** `github.com/oven-sh/bun/issues/6546`, opened 2023-10-17, **state: open**.
- **Author context:** Long-standing low-priority bug.
- **What it tells us:** *"no original function opendirSync to wrap"* when running OpenTelemetry fs instrumentation on Bun. fs auto-instrumentation hasn't worked since 2023. Not directly relevant to wallet HTTP handler (no fs ops), but corroborates the broader pattern: **Bun's Node.js compat surface is "most of node:* APIs work" but the small gaps land exactly where shimmer-patching expects to wrap functions.**

## Findings

### F1 (Q1 — load-bearing) — `@opentelemetry/sdk-node` works on Bun for **manual** instrumentation; auto-instrumentation is structurally broken since 2023

The bundled SDK loads. The shimmer-based auto-instrumentation packages (`@opentelemetry/auto-instrumentations-node`, `@opentelemetry/instrumentation-http`, `@opentelemetry/instrumentation-express`, `@opentelemetry/instrumentation-pg`) **do not work reliably on Bun**. Root cause per Source 3 (#13165): shimmer's monkey-patching breaks on Bun's bundle output. Per Source 11 (Datadog): default HTTP instrumentation as a dependency doesn't work well; even when it loads, you can't override span names usefully.

**The workable path:** initialize an OTel SDK programmatically (NodeSDK or NodeTracerProvider — both work for manual use), skip the auto-instrumentations packages, and use Hono middleware (`@hono/otel`) for HTTP-route spans + manual `tracer.startSpan(...)` calls inside `@bokchoy/wallet` wrappers. **Confidence: high** — corroborated by 4 independent sources (Sentry docs, Datadog docs, OneUptime guide, multiple Bun issues).

**Open thread:** Bun #28968 (Bun-native OTel) lands at some unspecified future date. Until then, the manual path is the supported path.

### F2 (Q2 — Hono) — `@hono/otel` is first-class Hono-org middleware that explicitly avoids shimmer

Source 5: `@hono/otel` is a `createMiddleware` Hono middleware that emits spans via `@opentelemetry/api` directly. **No shimmer monkey-patching.** Captures HTTP method, URL, route, status, configurable headers; supports custom `tracerProvider` / `meterProvider` / `tracer` / `spanNameFactory`. Authored by named TS engineers under the official honojs org.

Limitation: instruments the entire request-response lifecycle, not individual Hono middleware. Acceptable for slice 8.1; revisit if cross-middleware tracing becomes load-bearing (e.g., the idempotency middleware needs its own span boundary).

**Confidence: high.** Hono-org provenance + tier-1 source code + active package (published 2026-03-04). The package is the right shape for the Bun-broken-shimmer constraint — it doesn't fight that constraint.

### F3 (Q3 — postgres-js) — official `@opentelemetry/instrumentation-pg` does NOT cover postgres-js; community wrappers exist but are tier-3

Source 8 plus the WebSearch result: `@opentelemetry/instrumentation-pg` covers `pg` (node-postgres) and `pg-pool` only. postgres-js (`porsager/postgres`) — which BokChoy uses per `[[backend-stack]]` — is not covered. Two community options:

- `wataruoguchi/otel-instrumentation-postgres` v1.0.0 (2025-07-13). Wrapper-based. Standard OTel SQL attributes plus extras.
- `tomsanbear/opentelemetry-instrumentation-postgres` (alternative).

Both are tier-3 (single-maintainer community packages). Bun support not explicitly tested in surveyed scope. **Confidence: medium.** The alternative is **manual span emission inside the `@bokchoy/wallet` wrappers** — they already have `// TODO(otel)` markers for exactly that reason; the wrappers are the SQL-call boundary BokChoy actually owns. Manual spans there are tier-1 (BokChoy's own code), not tier-3 (community wrapper), and avoid the monkey-patching question entirely.

**Open thread:** verify whether the community postgres-js wrappers patch via shimmer (would inherit the Bun breakage) or via explicit hooks (would work). Source 8 didn't surface the patching mechanism.

### F4 (Q4 — exporter target) — Honeycomb's 20M-events/month free tier is concrete and sufficient at indie tier

Source 9: 20M events/month free, OTLP-native, no service/host limits. BokChoy indie peak (~3 writes/sec) yields ~7.7M events/month — comfortably within free. Studio+ projection (~575 writes/sec, ~1.5B/month) requires Pro+ paid; that's a Studio+-tier-business problem, not an MVP problem.

Grafana Cloud is the alternative — managed Tempo/Loki/Mimir, OTLP-native, free tier exists, **specific event/span limits not pulled in this research session**. Recommended re-fetch at /design pass if Grafana Cloud emerges as the preferred target. The discard-on-overlimit semantics (Source 10) are acceptable because OTel spans are observability not audit-of-record (the `transactions` table is the audit).

**Confidence: high on Honeycomb sufficiency, medium on Grafana Cloud sufficiency** (limit numbers absent).

**Self-hosted collector** (`@opentelemetry/collector` running on Render alongside the backend) is the third option. Eliminates external-vendor dependency, costs container CPU/memory, requires storage backend (Tempo/Jaeger). Premature ops complexity for indie tier; reasonable Studio+-tier consideration. Vault as future-option; not MVP.

**Console exporter** for dev. The OTel SDK ships `@opentelemetry/exporter-trace-otlp-http` for production endpoints and a `ConsoleSpanExporter` for local dev — switch via env var (`OTEL_EXPORTER_OTLP_ENDPOINT` set in prod, unset in dev → fall back to console).

### F5 (cross-cut) — SDK package contradiction across vendor docs is real but the practical effect is small

Sentry uses `@opentelemetry/sdk-trace-node` + `NodeTracerProvider` directly. OneUptime uses `@opentelemetry/sdk-node` + `NodeSDK`. The former is the lower-level building block; the latter is the bundled all-in-one. **Both work for manual instrumentation.** The difference is whether you're picking sdk-node for its convenience helpers or sdk-trace-node for its surface-area minimalism.

For BokChoy: NodeSDK (sdk-node) is the conventional pick — `@hono/otel`'s own README example uses it, and the surface is well-documented. Sentry's preference for sdk-trace-node is driven by their need to plug in custom Sampler/SpanProcessor/Propagator/ContextManager for Sentry-native correlation; BokChoy doesn't need that customization at slice 8.1.

**Confidence: high on the practical equivalence; low-medium on whether subtle differences emerge at production scale.** The contradiction is named for /design, not artificially resolved.

## Conflicts

### Conflict 1 — "OpenTelemetry works on Bun" (Datadog, OneUptime) vs "OpenTelemetry doesn't work on Bun" (Bun #3775, #26536, community)

Both true at different layers. **Resolution per Contradiction protocol (production code wins):** the issue tracker is closer to the actual code state than vendor blog posts. Vendor docs say "yes you can use it" because they sell support; the issue tracker says "no the auto-instrumentation primitives are broken" because that's the literal state. **Both statements coexist:** the SDK loads; the auto-instrumentation packages don't reliably patch HTTP/fs/express — only manual instrumentation works.

**Conditions:**
- "OpenTelemetry works on Bun" wins when: you mean *manual instrumentation via `@opentelemetry/api` + a Hono middleware + manual span emission*. Sentry's setup, OneUptime's programmatic-init pattern, and `@hono/otel` all satisfy this.
- "OpenTelemetry doesn't work on Bun" wins when: you mean *auto-instrumentation via `@opentelemetry/auto-instrumentations-node`* — the shimmer-based monkey-patching that wraps http/express/pg automatically. This path is broken since 2023.

Not artificially resolved. /design picks the manual path (the workable one), not auto-instrumentation. The conflict surfaces the real cost: **BokChoy pays manual-instrumentation overhead at every span boundary.**

### Conflict 2 — `@opentelemetry/sdk-node` (OneUptime) vs `@opentelemetry/sdk-trace-node` directly (Sentry)

Two production vendors recommend different SDK packages. **Resolution per Contradiction protocol (multiple independent production examples beat one):** the count is 1-vs-1; both are tier-2 vendor docs.

**Conditions:**
- sdk-node wins when: you want the conventional bundled API, you don't need fine-grained customization, and you accept the risk that future auto-instrumentations bundling improvements may push you toward upgrade decisions you don't want.
- sdk-trace-node wins when: you need a custom Sampler / SpanProcessor / Propagator / ContextManager (Sentry-style integration), or you want to minimize the surface area of OTel-imported code.

For BokChoy: sdk-node is fine for slice 8.1. **Not artificially resolved.** /design picks based on whether future custom-sampler / custom-propagator needs are anticipated (probably not at MVP) and whether `@hono/otel`'s example pattern (which uses sdk-node) is the reference to mirror (probably yes).

### Conflict 3 — Deno shipped native OTel (Feb 2025) but Bun has not — does this make Deno the right runtime?

Implicit conflict surfaced by the contradiction probe. Deno 2.2 native OTel is real. Bun's "Maybe" from 2023 hasn't moved to ship. This is **the same class of risk `[[backend-stack]]` Amendment named as F-Bun-1/2/3/4** — Bun lags Node ecosystem maturity in long-running-workload-adjacent areas.

**Resolution:** the runtime decision was already vaulted with explicit risk acceptance in `[[backend-stack]]` Amendment 2026-05-03. The user picked Bun knowing the trade. This research entry doesn't reopen that — it surfaces that the OTel-on-Bun cost (manual instrumentation tax) is part of the Bun-acceptance trade. **Documenting, not re-opening.** If F-Bun-N firefighting becomes load-bearing, the Node-22-fallback runbook is in place.

## Conditions

These findings hold under:

- **Bun 1.3+** as the runtime. Findings shift if BokChoy migrates to the documented Node.js 22 LTS fallback (auto-instrumentation works there).
- **Hono 4.x** as the HTTP framework. `@hono/otel` is Hono-version-coupled.
- **postgres-js (porsager/postgres)** as the DB driver. The community wrapper picks differ if BokChoy switches to node-postgres (then official `@opentelemetry/instrumentation-pg` applies cleanly).
- **Indie tier** scale (~3 writes/sec peak). Honeycomb 20M events/month suffices; revisit at Studio+ scale (~575 writes/sec) when paid tier becomes necessary regardless of vendor pick.
- **Time:** 2026-Q2. Bun #28968 (native OTel proposal) lands at some unspecified future date — possibly months, possibly never. Findings are current to 2026-05-09.

Revisit if:
- **Bun ships native OTel auto-instrumentation** (closes #28968 / #3775 with a real implementation). Manual-instrumentation tax goes away; reconsider auto-instrumentation packages.
- **A first-class postgres-js OTel package emerges** under `@opentelemetry/*` org. Today's community options (Source 8) are tier-3.
- **Honeycomb's free tier semantics change** (event allowance reduces, or service-count limits introduced) and BokChoy's projected event volume crosses the new limit.
- **Grafana Cloud OTLP free-tier limits are concretely surveyed** (current research did not pull specific event/span numbers).

## Operational implications

For BokChoy slice 8.1 + the wider OTel-wiring obligation across `@bokchoy/wallet` wrappers + future apps/backend modules:

### The actually viable stack (2026-Q2)

```
@opentelemetry/api                            // span emission API
@opentelemetry/sdk-node                       // SDK bootstrap (sdk-trace-node alternative)
@opentelemetry/exporter-trace-otlp-http       // OTLP/HTTP exporter
@opentelemetry/semantic-conventions           // span attribute keys
@opentelemetry/resources                      // service.name / service.version
@hono/otel                                    // Hono request-lifecycle middleware

// NOT installing: @opentelemetry/auto-instrumentations-node (broken on Bun)
// NOT installing: @opentelemetry/instrumentation-http (Bun #26536)
// NOT installing: @opentelemetry/instrumentation-pg (doesn't cover postgres-js anyway)
```

### Wiring shape for slice 8.1

1. **Bootstrap module** (`apps/backend/src/telemetry.ts`): NodeSDK with OTLPTraceExporter, started before any app imports per OneUptime guidance. Honeycomb endpoint via `OTEL_EXPORTER_OTLP_ENDPOINT` + `OTEL_EXPORTER_OTLP_HEADERS` env vars (or unset → ConsoleSpanExporter for dev).
2. **Hono middleware** in `apps/backend/src/index.ts`: `app.use(httpInstrumentationMiddleware({ serviceName, serviceVersion }))` — captures HTTP-route spans automatically. No shimmer; no Bun breakage.
3. **Manual spans inside `@bokchoy/wallet` wrappers**: replace each `// TODO(otel)` marker with `tracer.startActiveSpan('wallet.credit', { attributes: { 'bokchoy.project_id', 'bokchoy.wallet_id', 'bokchoy.amount', 'bokchoy.currency_id', 'bokchoy.reason_code', 'db.system': 'postgresql', 'db.operation': 'wallet_credit' } }, async (span) => { try { ... } catch (err) { span.recordException(err); span.setStatus(...); throw } finally { span.end() } })`. Attributes per `[[wrapper-shape]]` Engineering substance section.
4. **postgres-js spans:** kept manual inside the wrappers. Don't adopt the community wrapper at slice 8.1 — manual-inside-wrapper is tier-1 BokChoy code; community-wrapper is tier-3. Revisit if cross-feature postgres-js spans become useful (cockpit reads, outbox poller). Open thread on community-wrapper Bun-compat.

### Sub-decisions /design must close

- **OTel-or-defer:** ship `@hono/otel` + manual wrapper spans in slice 8.1, OR continue deferring (current `// TODO(otel)` discipline) for one more slice and bundle OTel with slice 8.2 or later. **Argument for ship-now:** the gap report's G7 was the only-without-research subdecision; this entry closes that. Manual-instrumentation tax is real but small (3-5 lines per span call site). Argument for defer: slice 8.1 ships the FIRST handler — adding OTel adds dependency-install + telemetry-bootstrap overhead. Defensible either way.
- **Bootstrap module location:** `apps/backend/src/telemetry.ts` (per OneUptime "init at top of entry"), or a `@bokchoy/telemetry` workspace package (Better-Auth-shape, makes telemetry reusable across future `apps/cockpit` etc.)? Workspace package is right shape if there will be multiple apps; single file is right if backend stays solo. Per `[[backend-service-shape]]` BokChoy is modular monolith — solo apps/backend at MVP — single file is fine. Revisit if cockpit ships as separate deploy.
- **Honeycomb vs Grafana Cloud:** Honeycomb cite is concrete (20M events/month). Grafana Cloud cite is incomplete (limits not pulled). Pick Honeycomb for slice 8.1 unless /design wants the Grafana Cloud limit-survey first. Multi-vendor exporter is technically possible (export to both via OTel collector) — premature for indie.
- **Vendor lock-in posture:** OTLP-native exporters are vendor-portable in principle. Switching from Honeycomb to Grafana Cloud requires changing endpoint + headers, no code changes. Minimal lock-in.

### Cascade obligations queued for /implementation (when OTel ships)

- `apps/backend/src/telemetry.ts` (or `@bokchoy/telemetry/`) — bootstrap module.
- `apps/backend/package.json` — install `@opentelemetry/{api,sdk-node,exporter-trace-otlp-http,semantic-conventions,resources}` + `@hono/otel`. Pin per `[[backend-stack]]` version-pin discipline.
- Each `@bokchoy/wallet` wrapper — replace `// TODO(otel)` with `tracer.startActiveSpan(...)` per the attribute spec in `[[wrapper-shape]]` Engineering substance.
- Hono error middleware (G5 in GAP 9) — sets `span.recordException(err); span.setStatus({ code: SpanStatusCode.ERROR })` when `WalletError` propagates to it.
- `.env.example` documenting `OTEL_EXPORTER_OTLP_ENDPOINT` + `OTEL_EXPORTER_OTLP_HEADERS` shape.
- **Optional bundle** with slice 8.1 OR queued as slice 8.1.5 follow-up depending on /design pick.

## Reproducibility note

Reproducible. All sources are public web URLs (Bun GitHub issues, opentelemetry-js GitHub, honeycomb pricing, Grafana Cloud docs, Sentry/Datadog/OneUptime vendor docs) and public source code (`@hono/otel` README + src, community postgres-js wrappers). Search queries recorded inline. Tools used: `gh api` for GitHub source/issues, `WebFetch` for docs, `WebSearch` for adoption probes.

The judgment that survives reproduction:
- Bun + auto-instrumentation is broken since 2023 — verifiable by reading `oven-sh/bun` open issues on opentelemetry tag.
- `@hono/otel` is the workable Hono path — verifiable by reading the source at `honojs/middleware/packages/otel`.
- Manual instrumentation works on Bun — verifiable by reading Sentry's custom-setup docs.
- Honeycomb 20M events/month free is sufficient at indie tier — verifiable by re-checking honeycomb.io/pricing.

The judgment that does NOT reproduce mechanically:
- "BokChoy should ship OTel in slice 8.1 vs slice 8.1.5" — depends on team-level scope-cost tolerance, not source-walkable. Documented as open sub-decision for /design.

## Open threads

- **Bun + community postgres-js wrapper compat verification.** Does `wataruoguchi/otel-instrumentation-postgres` work on Bun? Need to spike (clone, run integration test on a postgres-js + Bun setup) or wait for ecosystem signal. **Unblocks:** whether the wrapper is a viable substitute for manual-inside-`@bokchoy/wallet` spans.
- **Grafana Cloud free-tier specific limits.** This research session didn't pull span/event count numbers for the free tier. Would change the Honeycomb-vs-Grafana decision if Grafana ships materially better limits at indie tier.
- **Bun #28968 native OTel ship signal.** No timeline. Worth a quarterly check.
- **Trigger.dev's actual OTel setup on Bun.** `[[backend-stack]]` heavily cites Trigger.dev as the Bun production reference; their OTel shape would be a strong tier-1 production cite. Search did not surface a public engineering blog post on their OTel-on-Bun setup specifically.
- **`@hono/otel` cross-middleware span fragmentation.** README explicitly limits to request-lifecycle granularity, not per-middleware. If BokChoy's idempotency middleware (G4) needs its own span boundary for retry-replay diagnosability, that's an open thread post-slice-8.1.
- **Sampler/Propagator policy.** Slice 8.1 likely defaults to AlwaysOn sampler + W3C TraceContext propagator (OTel defaults). Production may want a parent-based sampler at higher traffic. /design or production-readiness slice closes this.
