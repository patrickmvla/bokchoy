'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { EyeIcon, EyeOffIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Separator } from '@/components/ui/separator';
import { Spinner } from '@/components/ui/spinner';
import { authClient } from '@/lib/auth-client';
import { userMessage } from '@/lib/error-messages';
import { type SignInInput, signInSchema } from '../lib/sign-in-schema';
import { GithubIcon, GoogleIcon } from './oauth-icons';

const CALLBACK_URL = '/projects';

export function SignInForm() {
  const router = useRouter();
  const [oauthPending, setOauthPending] = useState<'google' | 'github' | null>(
    null,
  );
  const [emailPending, setEmailPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<SignInInput>({
    resolver: zodResolver(signInSchema),
    defaultValues: { email: '', password: '' },
    mode: 'onBlur',
  });

  async function handleOAuth(provider: 'google' | 'github') {
    setOauthPending(provider);
    try {
      // Inline-return error surfaces provider misconfig / trustedOrigins mismatch; success path browser-redirects.
      const result = await authClient.signIn.social({
        provider,
        callbackURL: CALLBACK_URL,
      });
      if (result?.error) {
        toast.error(userMessage(result.error));
        setOauthPending(null);
      }
    } catch (err) {
      toast.error(userMessage(err));
      setOauthPending(null);
    }
  }

  async function onEmailSubmit(values: SignInInput) {
    setEmailPending(true);
    try {
      const { error } = await authClient.signIn.email({
        email: values.email,
        password: values.password,
      });
      if (error) {
        toast.error(userMessage(error));
        setEmailPending(false);
        return;
      }
      // Stay pending — releasing would flicker the button label mid-navigation as the form unmounts.
      router.push(CALLBACK_URL);
    } catch (err) {
      // Network failure or unexpected throw — Better Auth's client usually
      // returns errors via the {data, error} envelope, but a connection
      // drop bypasses that and throws TypeError. Without this branch the
      // button stayed locked on "Signing in…" with no feedback.
      toast.error(userMessage(err));
      setEmailPending(false);
    }
  }

  const anyPending = oauthPending !== null || emailPending;

  return (
    <div className="w-full space-y-6">
      <div className="space-y-3">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => handleOAuth('google')}
          disabled={anyPending}
        >
          {oauthPending === 'google' ? (
            <Spinner className="mr-2 size-4" />
          ) : (
            <GoogleIcon className="mr-2 size-4" />
          )}
          Continue with Google
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => handleOAuth('github')}
          disabled={anyPending}
        >
          {oauthPending === 'github' ? (
            <Spinner className="mr-2 size-4" />
          ) : (
            <GithubIcon className="mr-2 size-4" />
          )}
          Continue with GitHub
        </Button>
      </div>

      <div className="relative">
        <Separator />
        <span className="absolute left-1/2 -translate-x-1/2 -translate-y-1/2 top-1/2 bg-background px-3 text-xs text-muted-foreground">
          Or continue with email
        </span>
      </div>

      <form onSubmit={form.handleSubmit(onEmailSubmit)} noValidate>
        <FieldGroup>
          <Controller
            name="email"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Email</FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  type="email"
                  placeholder="you@example.com"
                  autoComplete="email"
                  aria-invalid={fieldState.invalid}
                  disabled={anyPending}
                />
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
          <Controller
            name="password"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Password</FieldLabel>
                <div className="relative">
                  <Input
                    {...field}
                    id={field.name}
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    aria-invalid={fieldState.invalid}
                    disabled={anyPending}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((prev) => !prev)}
                    disabled={anyPending}
                    aria-label={
                      showPassword ? 'Hide password' : 'Show password'
                    }
                    className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {showPassword ? (
                      <EyeOffIcon className="size-4" />
                    ) : (
                      <EyeIcon className="size-4" />
                    )}
                  </button>
                </div>
                {fieldState.invalid && (
                  <FieldError errors={[fieldState.error]} />
                )}
              </Field>
            )}
          />
        </FieldGroup>
        <div className="mt-6">
          <Button type="submit" className="w-full" disabled={anyPending}>
            {emailPending ? (
              <>
                <Spinner className="mr-2 size-4" />
                Signing in…
              </>
            ) : (
              'Sign in'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
