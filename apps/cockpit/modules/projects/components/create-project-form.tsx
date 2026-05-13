// Project-create form per [[cockpit/first-run-journey]] step 5 + 6 + 7:
//   - Step 5: client-side validation (name 1-64, slug kebab-case)
//   - Step 6: submit → POST /v1/projects → POST /v1/projects/{id}/api-keys
//     chained via TanStack mutation in modules/projects/hooks/use-create-project-and-key.ts
//     per (E2) split-POST in [[cockpit/admin-list-endpoints-contract]]
//   - Step 7: on success, open visible-once <ApiKeyModal> with the plaintext
//     key. K1 visible-once-on-creation per [[wallet-http-contract]] slice 8.1a
//     HMAC-stored key model.
//
// Pattern: react-hook-form <Controller> + shadcn <Field> family per
// [[cockpit/shadcn-setup]] Amendment 2026-05-12 (replaces the deprecated 2.x
// <Form> wrapper). zodResolver bridges the schema to RHF.
//
// Slug auto-derivation: name → slug pre-fills until the user manually edits
// the slug field. `autoSlug` boolean tracks intent — flipped to false on first
// user-driven slug change, preserving manual edits across subsequent name typing.
//
// Modal dismiss → router.push('/projects') (list view; project-detail page
// /projects/{id} ships in slice 8.4 next-cut per [[cockpit/first-run-journey]]
// step 11 verify-loop).
//
// Step-2-failure recovery: if POST /v1/projects succeeds but POST /v1/projects/{id}/api-keys
// fails, the chained mutation throws ProjectCreatedButKeyFailedError carrying
// the orphaned project. The form switches to a retry-key state showing a
// banner + a "Retry key creation" button that calls just step 2. Without this,
// the user retries the form, hits 409 PROJECT_SLUG_EXISTS, and is stuck.

'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { userMessage } from '@/lib/error-messages';
import {
  ProjectCreatedButKeyFailedError,
  useCreateProjectAndKey,
} from '../hooks/use-create-project-and-key';
import { useRetryApiKey } from '../hooks/use-retry-api-key';
import {
  type CreateProjectInput,
  createProjectSchema,
  deriveSlug,
} from '../lib/create-project-schema';
import type { Project } from '../types';
import { ApiKeyModal } from './api-key-modal';

export function CreateProjectForm() {
  const router = useRouter();
  const [autoSlug, setAutoSlug] = useState(true);
  const [issuedApiKey, setIssuedApiKey] = useState<string | null>(null);
  const [orphanedProject, setOrphanedProject] = useState<Project | null>(null);

  const form = useForm<CreateProjectInput>({
    resolver: zodResolver(createProjectSchema),
    defaultValues: { name: '', slug: '' },
    mode: 'onBlur',
  });

  const createMutation = useCreateProjectAndKey();
  const retryMutation = useRetryApiKey();

  function onSubmit(values: CreateProjectInput) {
    createMutation.mutate(values, {
      onSuccess: ({ apiKey }) => {
        setIssuedApiKey(apiKey);
      },
      onError: (error) => {
        if (error instanceof ProjectCreatedButKeyFailedError) {
          // Step 1 (project) committed; step 2 (api_key) failed. Switch to
          // retry-key UI rather than letting the user retry the whole form
          // (which would hit 409 PROJECT_SLUG_EXISTS).
          setOrphanedProject(error.project);
          toast.error(
            "Project created, but the API key couldn't be issued. Retry below.",
          );
        } else {
          toast.error(userMessage(error));
        }
      },
    });
  }

  function handleRetryKey() {
    if (!orphanedProject) return;
    retryMutation.mutate(
      { projectId: orphanedProject.id, projectName: orphanedProject.name },
      {
        onSuccess: ({ apiKey }) => {
          setOrphanedProject(null);
          setIssuedApiKey(apiKey);
        },
        onError: (error) => {
          toast.error(userMessage(error));
        },
      },
    );
  }

  function handleSkipKeyCreation() {
    if (!orphanedProject) return;
    setOrphanedProject(null);
    router.push('/projects');
  }

  function handleModalDismiss() {
    setIssuedApiKey(null);
    router.push('/projects');
  }

  // Retry-key state: project exists, no key yet. Hide the create-project form
  // and show a recovery panel instead.
  if (orphanedProject) {
    return (
      <div className="rounded-md border border-destructive/30 bg-destructive/5 p-6">
        <h2 className="text-base font-semibold">
          Project created — API key is owed
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          <span className="font-medium text-foreground">
            {orphanedProject.name}
          </span>{' '}
          was created (slug{' '}
          <code className="rounded bg-muted px-1 font-mono text-xs">
            {orphanedProject.slug}
          </code>
          ), but the SDK API key couldn't be issued. Retry below — the request
          uses the same Idempotency-Key as the first attempt, so a duplicate key
          won't be minted if it already committed server-side.
        </p>

        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            type="button"
            onClick={handleRetryKey}
            disabled={retryMutation.isPending}
          >
            {retryMutation.isPending ? 'Retrying…' : 'Retry key creation'}
          </Button>
          <Button
            type="button"
            variant="outline"
            onClick={handleSkipKeyCreation}
            disabled={retryMutation.isPending}
          >
            Skip — I'll create a key later
          </Button>
        </div>

        <ApiKeyModal
          open={issuedApiKey !== null}
          onDismiss={handleModalDismiss}
          apiKey={issuedApiKey}
          label="Your project API key"
        />
      </div>
    );
  }

  return (
    <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
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
                placeholder="My Game"
                autoComplete="off"
                aria-invalid={fieldState.invalid}
                onChange={(event) => {
                  field.onChange(event);
                  if (autoSlug) {
                    form.setValue('slug', deriveSlug(event.target.value), {
                      shouldValidate: false,
                    });
                  }
                }}
              />
              <FieldDescription>
                A human-readable name for this project.
              </FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />

        <Controller
          name="slug"
          control={form.control}
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={field.name}>Slug</FieldLabel>
              <Input
                {...field}
                id={field.name}
                placeholder="my-game"
                autoComplete="off"
                aria-invalid={fieldState.invalid}
                onChange={(event) => {
                  setAutoSlug(false);
                  field.onChange(event);
                }}
              />
              <FieldDescription>
                URL-friendly identifier. Auto-derived from name; edit to
                override.
              </FieldDescription>
              {fieldState.invalid && <FieldError errors={[fieldState.error]} />}
            </Field>
          )}
        />
      </FieldGroup>

      <div className="mt-6 flex justify-end">
        <Button
          type="submit"
          disabled={createMutation.isPending || form.formState.isSubmitting}
        >
          {createMutation.isPending ? 'Creating…' : 'Create project'}
        </Button>
      </div>

      <ApiKeyModal
        open={issuedApiKey !== null}
        onDismiss={handleModalDismiss}
        apiKey={issuedApiKey}
        label="Your project API key"
      />
    </form>
  );
}
