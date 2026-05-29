'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { PlusIcon, Trash2Icon } from 'lucide-react';
import { Controller, useFieldArray, useForm } from 'react-hook-form';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { userMessage } from '@/lib/error-messages';
import { useCurrencies } from '../../currencies/hooks/use-currencies';
import { useItems } from '../../items/hooks/use-items';
import { CatalogApiError } from '../../lib/catalog-api';
import { useCreateOffer } from '../hooks/use-create-offer';
import { useUpdateOffer } from '../hooks/use-update-offer';
import { type CreateOfferInput, createOfferSchema } from '../lib/offer-schema';
import type { Offer } from '../types';

interface OfferFormDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  projectId: string;
  /** Present → edit mode (code immutable, F2); absent → create. */
  offer?: Offer;
}

export function OfferFormDialog({
  open,
  onOpenChange,
  projectId,
  offer,
}: OfferFormDialogProps) {
  const isEdit = Boolean(offer);
  const createMutation = useCreateOffer(projectId);
  const updateMutation = useUpdateOffer(projectId);
  const { data: currencies } = useCurrencies(projectId);
  const { data: items } = useItems(projectId);

  const form = useForm<CreateOfferInput>({
    resolver: zodResolver(createOfferSchema),
    values: {
      code: offer?.code ?? '',
      displayName: offer?.displayName ?? '',
      description: offer?.description ?? '',
      active: offer?.active ?? false,
      prices:
        offer?.prices.map((p) => ({
          currencyCode: p.currencyCode,
          amount: p.amount,
        })) ?? [],
      items:
        offer?.items.map((i) => ({
          itemCode: i.itemCode,
          quantity: i.quantity,
        })) ?? [],
    },
  });

  const priceFields = useFieldArray({ control: form.control, name: 'prices' });
  const itemFields = useFieldArray({ control: form.control, name: 'items' });

  // BC093 (vi): block activating an offer with no price or no item — live + on submit (refine).
  const watchedPrices = form.watch('prices');
  const watchedItems = form.watch('items');
  const watchedActive = form.watch('active');
  const bc093Blocked =
    watchedActive && (watchedPrices.length === 0 || watchedItems.length === 0);

  function handleError(error: unknown) {
    if (error instanceof CatalogApiError && error.code === 'CODE_TAKEN') {
      form.setError('code', {
        message: 'This code is already used in this project.',
      });
      return;
    }
    if (
      error instanceof CatalogApiError &&
      error.code === 'OFFER_MISCONFIGURED'
    ) {
      form.setError('active', {
        message:
          'An active offer needs at least one price and at least one item.',
      });
      return;
    }
    toast.error(userMessage(error));
  }

  function onSubmit(values: CreateOfferInput) {
    if (offer) {
      updateMutation.mutate(
        {
          offerId: offer.id,
          input: {
            displayName: values.displayName,
            description: values.description,
            active: values.active,
            prices: values.prices,
            items: values.items,
          },
        },
        {
          onSuccess: () => {
            toast.success('Offer updated');
            onOpenChange(false);
          },
          onError: handleError,
        },
      );
    } else {
      createMutation.mutate(values, {
        onSuccess: () => {
          toast.success('Offer created');
          onOpenChange(false);
        },
        onError: handleError,
      });
    }
  }

  const pending = createMutation.isPending || updateMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit offer' : 'New offer'}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? 'Update this offer. The code cannot be changed.'
              : 'A priced, purchasable bundle — what players pay and what they receive.'}
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
                    placeholder="starter_pack"
                    autoComplete="off"
                    disabled={isEdit}
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldDescription>
                    {isEdit
                      ? 'Immutable — your game code references this.'
                      : 'Your game code references this (e.g. starter_pack). Cannot be changed later.'}
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
                    placeholder="Starter Pack"
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

            {/* Prices (buyer pays one of these) */}
            <Field>
              <FieldLabel>Prices</FieldLabel>
              <FieldDescription>
                The buyer pays one of these. Add at least one to activate the
                offer.
              </FieldDescription>
              <div className="space-y-2">
                {priceFields.fields.map((row, index) => (
                  <div key={row.id} className="flex items-start gap-2">
                    <Controller
                      name={`prices.${index}.currencyCode`}
                      control={form.control}
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger className="w-40">
                            <SelectValue placeholder="Currency" />
                          </SelectTrigger>
                          <SelectContent>
                            {currencies?.map((currency) => (
                              <SelectItem
                                key={currency.id}
                                value={currency.code}
                              >
                                {currency.code}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    <Controller
                      name={`prices.${index}.amount`}
                      control={form.control}
                      render={({ field, fieldState }) => (
                        <div className="flex-1">
                          <Input
                            {...field}
                            placeholder="100"
                            inputMode="decimal"
                            aria-invalid={fieldState.invalid}
                          />
                          {fieldState.invalid && (
                            <p className="mt-1 text-xs text-destructive">
                              {fieldState.error?.message}
                            </p>
                          )}
                        </div>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => priceFields.remove(index)}
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 self-start"
                disabled={!currencies || currencies.length === 0}
                onClick={() =>
                  priceFields.append({ currencyCode: '', amount: '' })
                }
              >
                <PlusIcon className="mr-2 size-4" />
                Add price
              </Button>
              {currencies && currencies.length === 0 && (
                <FieldDescription>Create a currency first.</FieldDescription>
              )}
            </Field>

            {/* Items (buyer receives all of these) */}
            <Field>
              <FieldLabel>Items granted</FieldLabel>
              <FieldDescription>
                The buyer receives all of these. Add at least one to activate
                the offer.
              </FieldDescription>
              <div className="space-y-2">
                {itemFields.fields.map((row, index) => (
                  <div key={row.id} className="flex items-start gap-2">
                    <Controller
                      name={`items.${index}.itemCode`}
                      control={form.control}
                      render={({ field }) => (
                        <Select
                          value={field.value}
                          onValueChange={field.onChange}
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue placeholder="Item" />
                          </SelectTrigger>
                          <SelectContent>
                            {items?.map((item) => (
                              <SelectItem key={item.id} value={item.code}>
                                {item.code}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    />
                    <Controller
                      name={`items.${index}.quantity`}
                      control={form.control}
                      render={({ field }) => (
                        <Input
                          type="number"
                          min={1}
                          className="w-24"
                          value={field.value}
                          onBlur={field.onBlur}
                          onChange={(event) =>
                            field.onChange(event.target.valueAsNumber || 1)
                          }
                        />
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => itemFields.remove(index)}
                    >
                      <Trash2Icon className="size-4" />
                    </Button>
                  </div>
                ))}
              </div>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 self-start"
                disabled={!items || items.length === 0}
                onClick={() => itemFields.append({ itemCode: '', quantity: 1 })}
              >
                <PlusIcon className="mr-2 size-4" />
                Add item
              </Button>
              {items && items.length === 0 && (
                <FieldDescription>Create an item first.</FieldDescription>
              )}
            </Field>

            <Controller
              name="active"
              control={form.control}
              render={({ field, fieldState }) => (
                <Field
                  orientation="horizontal"
                  data-invalid={fieldState.invalid}
                >
                  <Switch
                    id={field.name}
                    checked={field.value}
                    onCheckedChange={field.onChange}
                  />
                  <div>
                    <FieldLabel htmlFor={field.name}>
                      Active (purchasable)
                    </FieldLabel>
                    {bc093Blocked && (
                      <p className="mt-1 text-xs text-destructive">
                        Add at least one price and one item before activating.
                      </p>
                    )}
                    {fieldState.invalid && (
                      <FieldError errors={[fieldState.error]} />
                    )}
                  </div>
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
            <Button type="submit" disabled={pending || bc093Blocked}>
              {pending ? 'Saving…' : isEdit ? 'Save changes' : 'Create offer'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
