import { z } from 'zod';

const ITEM_CODE = /^[A-Za-z0-9_]{1,64}$/;

const itemBase = z.object({
  code: z
    .string()
    .regex(
      ITEM_CODE,
      'Letters, numbers, and underscores only; 1–64 characters.',
    ),
  displayName: z.string().trim().min(1, 'Required.').max(128),
  description: z.string().trim().max(2000),
  stackable: z.boolean(),
  // null = unlimited. Only meaningful for stackable items (backend CHECK + refine below).
  maxCount: z.number().int().positive().nullable(),
  active: z.boolean(),
});

export const createItemSchema = itemBase.refine(
  (v) => v.stackable || v.maxCount === null,
  { message: 'Max count only applies to stackable items.', path: ['maxCount'] },
);
export type CreateItemInput = z.infer<typeof createItemSchema>;

// `code` and `stackable` are immutable post-create (F2, F3). maxCount-vs-stackable consistency
// is enforced in the form (stackable is fixed on edit); the backend CHECK is the backstop.
export const updateItemSchema = itemBase.omit({ code: true, stackable: true });
export type UpdateItemInput = z.infer<typeof updateItemSchema>;
