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
import { useCreateItem } from '../hooks/use-create-item';
import { useUpdateItem } from '../hooks/use-update-item';
import { type CreateItemInput, createItemSchema } from '../lib/item-schema';
import type { Item } from '../types';

interface ItemFormDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  projectId: string;
  /** Present → edit mode (code + stackable immutable, F2/F3); absent → create mode. */
  item?: Item;
}

export function ItemFormDialog({
  open,
  onOpenChange,
  projectId,
  item,
}: ItemFormDialogProps) {
  const isEdit = Boolean(item);
  const createMutation = useCreateItem(projectId);
  const updateMutation = useUpdateItem(projectId);

  const form = useForm<CreateItemInput>({
    resolver: zodResolver(createItemSchema),
    values: {
      code: item?.code ?? '',
      displayName: item?.displayName ?? '',
      description: item?.description ?? '',
      stackable: item?.stackable ?? true,
      maxCount: item?.maxCount ?? null,
      active: item?.active ?? true,
    },
  });

  const stackable = form.watch('stackable');

  function handleError(error: unknown) {
    if (error instanceof CatalogApiError && error.code === 'CODE_TAKEN') {
      form.setError('code', {
        message: 'This code is already used in this project.',
      });
      return;
    }
    toast.error(userMessage(error));
  }

  function onSubmit(values: CreateItemInput) {
    if (item) {
      updateMutation.mutate(
        {
          itemId: item.id,
          input: {
            displayName: values.displayName,
            description: values.description,
            maxCount: values.maxCount,
            active: values.active,
          },
        },
        {
          onSuccess: () => {
            toast.success('Item updated');
            onOpenChange(false);
          },
          onError: handleError,
        },
      );
    } else {
      createMutation.mutate(values, {
        onSuccess: () => {
          toast.success('Item created');
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
          <DialogTitle>{isEdit ? 'Edit item' : 'New item'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update this item. Code and stackability cannot be changed.'
              : 'Define an item players can own.'}
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
                    placeholder="health_potion"
                    autoComplete="off"
                    disabled={isEdit}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>
                    {isEdit
                      ? 'Immutable — your game code references this.'
                      : 'Your game code references this (e.g. health_potion). Cannot be changed later.'}
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
                    placeholder="Health Potion"
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
              name="stackable"
              control={form.control}
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Switch
                    id={field.name}
                    checked={field.value}
                    disabled={isEdit}
                    onCheckedChange={(checked) => {
                      field.onChange(checked);
                      // Non-stackable items can't carry a max count (backend CHECK).
                      if (!checked)
                        form.setValue('maxCount', null, {
                          shouldValidate: true,
                        });
                    }}
                  />
                  <FieldLabel htmlFor={field.name}>
                    Stackable (consolidated count){isEdit ? ' — immutable' : ''}
                  </FieldLabel>
                </Field>
              )}
            />

            <Controller
              name="maxCount"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={field.name}>Max count</FieldLabel>
                  <Input
                    id={field.name}
                    name={field.name}
                    type="number"
                    min={1}
                    disabled={!stackable}
                    value={field.value ?? ''}
                    onBlur={field.onBlur}
                    onChange={(event) =>
                      field.onChange(
                        event.target.value === ''
                          ? null
                          : event.target.valueAsNumber || 1,
                      )
                    }
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>
                    {stackable
                      ? 'Per-player cap. Leave blank for unlimited.'
                      : 'Only applies to stackable items.'}
                  </FieldDescription>
                  {fieldState.invalid && (
                    <FieldError errors={[fieldState.error]} />
                  )}
                </Field>
              )}
            />

            <Controller
              name="active"
              control={form.control}
              render={({ field }) => (
                <Field orientation="horizontal">
                  <Switch
                    id={field.name}
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <FieldLabel htmlFor={field.name}>
                    Active (available in circulation)
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
              {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create item'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
