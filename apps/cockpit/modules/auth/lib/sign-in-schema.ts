// Zod v4 schema for the email/password sign-in form per
// [[cockpit-stack-integration-research]] F7 (item 2).
//
// Constraints are minimal — Better Auth's emailAndPassword.enabled handler
// validates server-side and rejects with the appropriate error. Client-side
// validation here exists to give immediate feedback on obviously-bad input
// (empty, malformed email, too-short password) before round-tripping to the
// backend.

import { z } from 'zod';

export const signInSchema = z.object({
  email: z.email('Enter a valid email address.'),
  password: z.string().min(1, 'Password is required.'),
});

export type SignInInput = z.infer<typeof signInSchema>;
