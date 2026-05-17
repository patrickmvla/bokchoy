// OpenTelemetry SDK bootstrap per [[wallet-http-contract]] G7 +
// [[otel-stack-research]] (manual instrumentation path; auto-instrumentations
// are structurally broken on Bun per F1 — Bun #3775 / #13165 shimmer-patching
// at bundle layer; manual @hono/otel + manual tracer.startActiveSpan inside
// wrappers is the workable path).
//
// MUST be imported at the top of the entry-point BEFORE any app modules. Side-
// effect import: starts the SDK on require/import per OneUptime guide pattern.
//
// Endpoint via OTEL_EXPORTER_OTLP_ENDPOINT env var. Honeycomb prod target:
//   OTEL_EXPORTER_OTLP_ENDPOINT=https://api.honeycomb.io/v1/traces
//   OTEL_EXPORTER_OTLP_HEADERS=x-honeycomb-team=<team-key>
// Unset → ConsoleSpanExporter for dev (per [[otel-stack-research]] F4).
//
// Sampler: OTel default (AlwaysOn at slice 8.1b — revisit at scale per
// [[wallet-http-contract]] revisit-when on parent-based sampler at higher
// traffic). Propagator: OTel default W3C TraceContext.

import { createHmac } from 'node:crypto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK, tracing } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const SERVICE_NAME = 'bokchoy-backend';
const SERVICE_VERSION = process.env.npm_package_version ?? '0.0.0';

// Customer-controlled player external_id is NOT emitted raw on OTel spans per
// [[wallet/credit-route-contract]] (iv) — Stripe-metadata-style customer-
// responsibility framing, with an HMAC-truncated correlation key on observability
// surfaces so ops engineers can correlate spans for the same player without
// seeing the raw value (which customers are advised but not forced to keep
// PII-free per SECURITY.md cascade). Raw value stays in the players table;
// customer-facing error responses (e.g. UnknownPlayerError) keep the raw value
// because customers need it for debugging — selective hashing per the contract's
// rejected-Q4-alternative defense.
//
// Salt is loaded eagerly at module init so a missing salt fails the process at
// boot, not on the first credit. Required only when the player-centric routes
// are mounted; current entry-point always mounts them, so missing salt = boot
// failure. Width: HMAC-SHA256 → 32 bytes → 64 hex chars; sliced to 16 hex chars
// per (iv). Collision math: 16 hex = 64 bits of state, birthday-collision N²/2⁶⁴
// at 1M distinct external_ids per project ≈ 2.7×10⁻⁸ — acceptable for span
// correlation. Widen to 32 hex if collisions are observed (revisit-when in (iv)).
const PII_SALT = process.env.BOKCHOY_OTEL_PII_SALT;
if (!PII_SALT || PII_SALT.length < 32) {
  throw new Error('BOKCHOY_OTEL_PII_SALT must be set and at least 32 chars; see .env.example');
}

const PII_SALT_LOADED: string = PII_SALT;

export function hashPlayerExternalIdForOtel(externalId: string): string {
  return createHmac('sha256', PII_SALT_LOADED).update(externalId).digest('hex').slice(0, 16);
}

const traceExporter = process.env.OTEL_EXPORTER_OTLP_ENDPOINT
  ? new OTLPTraceExporter()
  : new tracing.ConsoleSpanExporter();

const sdk = new NodeSDK({
  resource: resourceFromAttributes({
    [ATTR_SERVICE_NAME]: SERVICE_NAME,
    [ATTR_SERVICE_VERSION]: SERVICE_VERSION,
  }),
  traceExporter,
});

sdk.start();

// Graceful shutdown — flush spans before process exit. Avoids dropped spans on
// SIGTERM / SIGINT. Idempotent (sdk.shutdown handles double-call).
const shutdown = () => {
  sdk
    .shutdown()
    .catch((err: unknown) => console.error('OTel shutdown failed', err))
    .finally(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { SERVICE_NAME, SERVICE_VERSION };
