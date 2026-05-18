import { z } from 'zod';

// Mirrors Better Auth defaults (minPasswordLength=8) — keeps client + server validation aligned.
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
