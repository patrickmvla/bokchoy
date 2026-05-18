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
import { type SignUpInput, signUpSchema } from '../lib/sign-up-schema';
import { GithubIcon, GoogleIcon } from './oauth-icons';

const CALLBACK_URL = '/projects';

export function SignUpForm() {
  const router = useRouter();
  const [oauthPending, setOauthPending] = useState<'google' | 'github' | null>(
    null,
  );
  const [emailPending, setEmailPending] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const form = useForm<SignUpInput>({
    resolver: zodResolver(signUpSchema),
    defaultValues: { name: '', email: '', password: '' },
    mode: 'onBlur',
  });

  async function handleOAuth(provider: 'google' | 'github') {
    setOauthPending(provider);
    try {
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

  async function onEmailSubmit(values: SignUpInput) {
    setEmailPending(true);
    try {
      const { error } = await authClient.signUp.email({
        email: values.email,
        password: values.password,
        name: values.name,
      });
      if (error) {
        toast.error(userMessage(error));
        setEmailPending(false);
        return;
      }
      // Better Auth auto-signs-in on signUp.email success; navigate.
      router.push(CALLBACK_URL);
    } catch (err) {
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
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 bg-background px-3 text-xs text-muted-foreground">
          Or sign up with email
        </span>
      </div>

      <form onSubmit={form.handleSubmit(onEmailSubmit)} noValidate>
        <FieldGroup>
          <Controller
            name="name"
            control={form.control}
            render={({ field, fieldState }) => (
              <Field data-invalid={fieldState.invalid}>
                <FieldLabel htmlFor={field.name}>Name</FieldLabel>
                <Input
                  {...field}
                  id={field.name}
                  placeholder="Ada Lovelace"
                  autoComplete="name"
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
                    placeholder="At least 8 characters"
                    autoComplete="new-password"
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
                    className="absolute right-2 top-1/2 inline-flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
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
                Creating account…
              </>
            ) : (
              'Create account'
            )}
          </Button>
        </div>
      </form>
    </div>
  );
}
