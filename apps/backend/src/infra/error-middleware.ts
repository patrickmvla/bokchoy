// Hono onError middleware per [[wallet-http-contract]] slice 8.1c. Translates:
//   • WalletError      → Stripe-wrapped `{error:{code,message,...details-flattened}}`
//                        with BCxxx → HTTP status per [[wallet-mechanics]] §SQLSTATE
//                        + [[wallet-http-contract]] error-table.
//   • HTTPException 400 → `{error:{code:'VALIDATION_ERROR',message,issues:[]}}` per
//                        Standard Schema `Issue` shape (`message`, `path`).
//   • Anything else    → `{error:{code:'INTERNAL_SERVER_ERROR',message}}` 500.
//
// Cross-runtime discipline preserved (no Bun-specific imports).

import { WalletError } from '@bokchoy/wallet';
import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

// BCxxx → HTTP status verbatim from [[wallet-http-contract]] error-table +
// [[wallet-mechanics]] Part 3 A18 Amendment 2026-05-11 (BC400-BC499 auth):
//   BC001 → 409  IdempotencyKeyInUse           (middleware-raised)
//   BC002 → 422  IdempotencyKeyMismatch        (middleware-raised)
//   BC010 → 422  InsufficientFunds
//   BC020 → 500  TenantMismatch                (defense-in-depth — should never fire from well-formed callers)
//   BC021 → 422  WalletNotFound
//   BC022 → 422  CurrencyMismatch
//   BC030 → 422  PolicyViolation               (reserved)
//   BC040 → 500  ConfigurationError            (anon_secret missing)
//   BC050 → 422  ReasonCodeNotRegistered       (translated from PG 23503)
//   BC060 → 422  CurrencyNotFound              (reserved — translated from PG 23503)
//   BC400 → 400  AdminContextMissing           (adminGate-raised; no organizationId in body/query/session)
//   BC401 → 401  AdminUnauthenticated          (adminGate-raised; getSession returned null)
//   BC402 → 400  AdminInvalidInput             (adminGate-raised; malformed UUID or missing URL param)
//   BC403 → 403  AdminCrossOrgForbidden        (adminGate-raised; project.organization_id mismatch)
//   BC404 → 403  AdminNotAMember               (adminGate-raised; no member row in resolved org)
//   BC405 → 403  AdminInsufficientPermissions  (adminGate-raised; hasPermission false)
//
// BC400-BC405 are documentary here — adminGate returns c.json directly (matches
// apiKeyMiddleware + idempotencyMiddleware convention) so this map is NOT
// load-bearing for the gate flow. Single-source documentation of every BCxxx →
// HTTP-status mapping for the system.
const BC_TO_HTTP: Record<string, ContentfulStatusCode> = {
  BC001: 409,
  BC002: 422,
  BC010: 422,
  BC020: 500,
  BC021: 422,
  BC022: 422,
  BC030: 422,
  BC040: 500,
  BC050: 422,
  BC060: 422,
  BC400: 400,
  BC401: 401,
  BC402: 400,
  BC403: 403,
  BC404: 403,
  BC405: 403,
};

export const errorMiddleware: ErrorHandler = (err, c) => {
  if (err instanceof WalletError) {
    const status: ContentfulStatusCode = BC_TO_HTTP[err.code] ?? 500;
    // Flatten WalletError.details fields as siblings of code/message inside
    // the `error` object per [[wallet-http-contract]] G5 (X) Stripe-wrapped:
    //   {"error":{"code":"BC010","message":"...","walletId":"...","requested":100,"available":50}}
    // The `code` field of details is omitted (it duplicates err.code).
    const { code: _detailCode, ...detailFields } = err.details;
    return c.json(
      {
        error: {
          code: err.code,
          message: err.message,
          ...detailFields,
        },
      },
      status,
    );
  }

  // Validator failure surfaces as HTTPException with status 400 from sValidator;
  // it carries no structured issues by default, so we fall through with the
  // generic message. The sValidator hook (passed at the route definition site)
  // is the place to capture issues and rethrow with structured payload — kept
  // out of this middleware to avoid coupling.
  if (err instanceof HTTPException) {
    if (err.status === 400) {
      return c.json(
        {
          error: {
            code: 'VALIDATION_ERROR',
            message: err.message || 'Request validation failed',
          },
        },
        400,
      );
    }
    return err.getResponse();
  }

  console.error('Unhandled error', err);
  return c.json(
    {
      error: {
        code: 'INTERNAL_SERVER_ERROR',
        message: 'Internal error',
      },
    },
    500,
  );
};
