import { z } from 'zod';

// Mirrors the backend `currencies_code_check` + the contract's CurrencyAdmin field rules.
const CURRENCY_CODE = /^[A-Za-z0-9_]{1,16}$/;

export const createCurrencySchema = z.object({
  code: z
    .string()
    .regex(
      CURRENCY_CODE,
      'Letters, numbers, and underscores only; 1–16 characters.',
    ),
  displayName: z.string().trim().min(1, 'Required.').max(128),
  // Always sent (trimmed; '' = no description) so clearing it on edit persists.
  description: z.string().trim().max(2000),
  decimals: z.number().int().min(0).max(8),
  isPremium: z.boolean(),
  isTradable: z.boolean(),
});
export type CreateCurrencyInput = z.infer<typeof createCurrencySchema>;

// `code` is immutable post-create (F2) — omitted from the edit form.
export const updateCurrencySchema = createCurrencySchema.omit({ code: true });
export type UpdateCurrencyInput = z.infer<typeof updateCurrencySchema>;
