/** OTel SDK bootstrap + PII hash helper. Per [[wallet-http-contract]] G7 + [[wallet/credit-route-contract]] (iv). */

import { createHmac } from 'node:crypto';
import { OTLPTraceExporter } from '@opentelemetry/exporter-trace-otlp-http';
import { resourceFromAttributes } from '@opentelemetry/resources';
import { NodeSDK, tracing } from '@opentelemetry/sdk-node';
import { ATTR_SERVICE_NAME, ATTR_SERVICE_VERSION } from '@opentelemetry/semantic-conventions';

const SERVICE_NAME = 'bokchoy-backend';
const SERVICE_VERSION = process.env.npm_package_version ?? '0.0.0';

// Eager salt load — fail at boot, not at first credit. 16-hex truncation = 64 bits, birthday-safe to ~1M ids/project.
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

const shutdown = () => {
  sdk
    .shutdown()
    .catch((err: unknown) => console.error('OTel shutdown failed', err))
    .finally(() => process.exit(0));
};
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

export { SERVICE_NAME, SERVICE_VERSION };
