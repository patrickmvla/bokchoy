import { z } from 'zod';

const OFFER_CODE = /^[A-Za-z0-9_]{1,64}$/;
const AMOUNT = /^\d{1,16}(\.\d{1,4})?$/; // NUMERIC(20,4)

const priceInput = z.object({
  currencyCode: z.string().min(1, 'Select a currency.'),
  amount: z
    .string()
    .regex(AMOUNT, 'A number with up to 4 decimals.')
    .refine((v) => Number(v) > 0, 'Must be greater than 0.'),
});

const itemInput = z.object({
  itemCode: z.string().min(1, 'Select an item.'),
  quantity: z.number().int().positive(),
});

const offerBase = z.object({
  code: z
    .string()
    .regex(
      OFFER_CODE,
      'Letters, numbers, and underscores only; 1–64 characters.',
    ),
  displayName: z.string().trim().min(1, 'Required.').max(128),
  description: z.string().trim().max(2000),
  active: z.boolean(),
  prices: z.array(priceInput),
  items: z.array(itemInput),
});

// BC093 (vi): an active offer requires ≥1 price AND ≥1 item. Client gate; SQL backstop is BC093.
const bc093 = (v: { active: boolean; prices: unknown[]; items: unknown[] }) =>
  !v.active || (v.prices.length >= 1 && v.items.length >= 1);
const bc093Issue = {
  message: 'An active offer needs at least one price and at least one item.',
  path: ['active'],
};

export const createOfferSchema = offerBase.refine(bc093, bc093Issue);
export type CreateOfferInput = z.infer<typeof createOfferSchema>;

// `code` is immutable post-create (F2).
export const updateOfferSchema = offerBase
  .omit({ code: true })
  .refine(bc093, bc093Issue);
export type UpdateOfferInput = z.infer<typeof updateOfferSchema>;
