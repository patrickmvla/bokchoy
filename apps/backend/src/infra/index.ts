// Infra module per [[backend-service-shape]] §2. DB connection (consumes
// @bokchoy/db's createDbClient), withTenant transaction wrapper for RLS GUC
// per [[backend-stack]] F1 + [[multi-tenant-rls-research]], telemetry plumbing,
// audit-log helpers.

export { client, db } from './db';
export { errorMiddleware } from './error-middleware';
