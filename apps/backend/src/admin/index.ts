// Admin module per [[backend-service-shape]] §2 + [[admin-auth-surface]]
// cascade obligation #2. Re-exports the adminGate middleware factory + its
// context type for consumer route registration.

export { type AdminContext, type AdminGateOptions, adminGate } from './admin-gate';
