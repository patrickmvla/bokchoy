'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '@/components/ui/field';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { userMessage } from '@/lib/error-messages';
import { CatalogApiError } from '../../lib/catalog-api';
import { useCreateCurrency } from '../hooks/use-create-currency';
import { useUpdateCurrency } from '../hooks/use-update-currency';
import {
  type CreateCurrencyInput,
  createCurrencySchema,
} from '../lib/currency-schema';
import type { Currency } from '../types';

interface CurrencyFormDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  projectId: string;
  /** Present → edit mode (code immutable, F2); absent → create mode. */
  currency?: Currency;
}

export function CurrencyFormDialog({
  open,
  onOpenChange,
  projectId,
  currency,
}: CurrencyFormDialogProps) {
  const isEdit = Boolean(currency);
  const createMutation = useCreateCurrency(projectId);
  const updateMutation = useUpdateCurrency(projectId);

  const form = useForm<CreateCurrencyInput>({
    resolver: zodResolver(createCurrencySchema),
    // `values` (not defaultValues) re-syncs the reused dialog when switching create/edit targets.
    values: {
      code: currency?.code ?? '',
      displayName: currency?.displayName ?? '',
      description: currency?.description ?? '',
      decimals: currency?.decimals ?? 0,
      isPremium: currency?.isPremium ?? false,
      isTradable: currency?.isTradable ?? false,
    },
  });

  function handleError(error: unknown) {
    if (error instanceof CatalogApiError && error.code === 'CODE_TAKEN') {
      form.setError('code', {
        message: 'This code is already used in this project.',
      });
      return;
    }
    toast.error(userMessage(error));
  }

  function onSubmit(values: CreateCurrencyInput) {
    if (currency) {
      updateMutation.mutate(
        {
          currencyId: currency.id,
          input: {
            displayName: values.displayName,
            description: values.description,
            decimals: values.decimals,
            isPremium: values.isPremium,
            isTradable: values.isTradable,
          },
        },
        {
          onSuccess: () => {
            toast.success('Currency updated');
            onOpenChange(false);
          },
          onError: handleError,
        },
      );
    } else {
      createMutation.mutate(values, {
        onSuccess: () => {
          toast.success('Currency created');
          onOpenChange(false);
        },
        onError: handleError,
      });
    }
  }

  const pending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit currency' : 'New currency'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update this currency. The code cannot be changed.'
              : 'Define a currency players can hold and spend.'}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
          <FieldGroup>
            <Controller
              name="code"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Code</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    placeholder="gems"
                    autoComplete="off"
                    disabled={isEdit}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>
                    {isEdit
                      ? 'Immutable — your game code references this.'
                      : 'Your game code references this (e.g. gems). Cannot be changed later.'}
                  </FieldDescription>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="displayName"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Display name</FieldLabel>
                  <Input
                    {...field}
                    id={field.name}
                    placeholder="Gems"
                    autoComplete="off"
                    aria-invalid={fieldState.invalid}
                  />
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="description"
              control={form.control}
              render={({ field }) => (
                <Field>
                  <FieldLabel htmlFor={field.name}>Description</FieldLabel>
                  <Textarea
                    {...field}
                    id={field.name}
                    rows={2}
                    placeholder="Optional."
                  />
                </Field>
              )}
            />

            <Controller
              name="decimals"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Decimals</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="number"
                    min={0}
                    max={8}
                    value={field.value}
                    onBlur={field.onBlur}
                    onChange={(event) =>
                      field.onChange(event.target.valueAsNumber || 0)
                    }
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>
                    Display precision (0–8). Storage is always exact.
                  </FieldDescription>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="isPremium"
              control={form.control}
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Switch
                    id={field.name}
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <FieldLabel htmlFor={field.name}>
                    Premium (hard currency)
                  </FieldLabel>
                </Field>
              )}
            />

            <Controller
              name="isTradable"
              control={form.control}
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Switch
                    id={field.name}
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <FieldLabel htmlFor={field.name}>
                    Tradable between players
                  </FieldLabel>
                </Field>
              )}
            />
          </FieldGroup>

          <DialogFooter className="mt-6">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending
                ? 'Saving…'
                : isEdit
                  ? 'Save changes'
                  : 'Create currency'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
