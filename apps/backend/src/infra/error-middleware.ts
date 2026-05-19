/** Hono onError middleware. Translates BcError + HTTPException to Stripe-wrapped JSON per [[wallet-http-contract]] G5. */

import { BcError } from '@bokchoy/wallet';
import type { ErrorHandler } from 'hono';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

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
  if (err instanceof BcError) {
    const status: ContentfulStatusCode = BC_TO_HTTP[err.code] ?? 500;
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
