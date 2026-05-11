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

import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK, tracing } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const SERVICE_NAME = 'bokchoy-backend';
const SERVICE_VERSION = process.env.npm_package_version ?? '0.0.0';

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
