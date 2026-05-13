// Sign-up route at bokchoy.com/sign-up per [[cockpit-stack-integration-research]]
// F7 + [[cockpit/first-run-journey]] step 1 (email/password sign-up surface).
//
// OUTSIDE the (app)/ route group — no auth gate. Public-reachable by design.
// Server Component shell; the interactive form lives in <SignUpForm>.

import Link from 'next/link';
import { SignUpForm } from '@/modules/auth/components/sign-up-form';

export default function SignUpPage() {
  return (
    <main className="mx-auto flex min-h-[calc(100vh-2rem)] max-w-md flex-col justify-center px-4 py-10">
      <header className="mb-8 text-center">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create your BokChoy account
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Start integrating game economies in minutes.
        </p>
      </header>
      <SignUpForm />
      <p className="mt-8 text-center text-sm text-muted-foreground">
        Already have an account?{' '}
        <Link
          href="/sign-in"
          className="font-medium text-foreground underline underline-offset-4 hover:text-primary"
        >
          Sign in
        </Link>
      </p>
    </main>
  );
}
