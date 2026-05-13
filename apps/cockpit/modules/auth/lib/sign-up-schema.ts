// Zod schema for the sign-up form.
//
// Constraints mirror Better Auth's emailAndPassword defaults
// (minPasswordLength=8) per Better Auth v1.x server-side validation —
// keeping client-side validation aligned avoids "form passed but backend
// rejected" UX surprises. Name uses min(1) since Better Auth's user table
// has a NOT NULL name field per packages/db/src/schema/auth.ts.

import { z } from 'zod';

export const signUpSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, 'Name is required.')
    .max(100, 'Name must be 100 characters or fewer.'),
  email: z.email('Enter a valid email address.'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters.')
    .max(128, 'Password must be 128 characters or fewer.'),
});

export type SignUpInput = z.infer<typeof signUpSchema>;
