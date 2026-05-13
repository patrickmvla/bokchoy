// Sign-in route at bokchoy.com/sign-in per [[cockpit/first-run-journey]] step 1
// + [[cockpit-stack-integration-research]] F7.
//
// OUTSIDE the (app)/ route group — no auth gate. Public-reachable by design:
// unauthenticated users redirected from (app)/* land here.
//
// Server Component shell (no 'use client') — the interactive form lives in
// the Client Component <SignInForm> which owns OAuth + email/password flows
// via authClient from @/lib/auth-client.

import Link from 'next/link';
import { SignInForm } from '@/modules/auth/components/sign-in-form';

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-md flex-col justify-center px-4 py-10">
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Sign in to BokChoy
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          OAuth or email/password — your call.
        </p>
      </header>
      <SignInForm />
      <p className="mt-8 text-center text-sm text-muted-foreground">
        New to BokChoy?{' '}
        <Link
          href="/sign-up"
          className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
        >
          Create an account
        </Link>
      </p>
    </main>
  );
}
