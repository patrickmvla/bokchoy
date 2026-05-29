'use client';

import { PlusIcon } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { useCurrencies } from '../hooks/use-currencies';
import type { Currency } from '../types';
import { CurrencyFormDialog } from './currency-form-dialog';
import { DeleteCurrencyDialog } from './delete-currency-dialog';

type DialogState =
  | { mode: 'create' }
  | { mode: 'edit'; currency: Currency }
  | { mode: 'delete'; currency: Currency }
  | null;

export function CurrenciesList({ projectId }: { projectId: string }) {
  const {
    data: currencies,
    isLoading,
    isError,
    error,
  } = useCurrencies(projectId);
  const [dialog, setDialog] = useState<DialogState>(null);

  function flagsLabel(currency: Currency): string {
    const flags = [
      currency.isPremium && 'premium',
      currency.isTradable && 'tradable',
    ].filter(Boolean);
    return flags.length > 0 ? flags.join(', ') : '—';
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Currencies</h1>
          <p className="text-sm text-muted-foreground">
            Denominations players can hold and spend.
          </p>
        </div>
        <Button type="button" onClick={() => setDialog({ mode: 'create' })}>
          <PlusIcon className="mr-2 size-4" />
          New currency
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-12 text-muted-foreground">
          <Spinner className="size-4" />
          Loading currencies…
        </div>
      )}

      {isError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load currencies: {error?.message ?? 'Unknown error.'}
        </div>
      )}

      {currencies && currencies.length === 0 && (
        <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
          No currencies yet. Create your first one to start building offers.
        </div>
      )}

      {currencies && currencies.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Decimals</TableHead>
              <TableHead>Flags</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {currencies.map((currency) => (
              <TableRow key={currency.id}>
                <TableCell className="font-mono">{currency.code}</TableCell>
                <TableCell>{currency.displayName}</TableCell>
                <TableCell>{currency.decimals}</TableCell>
                <TableCell className="text-xs text-muted-foreground">
                  {flagsLabel(currency)}
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDialog({ mode: 'edit', currency })}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDialog({ mode: 'delete', currency })}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <CurrencyFormDialog
        open={dialog?.mode === 'create' || dialog?.mode === 'edit'}
        onOpenChange={(next) => {
          if (!next) setDialog(null);
        }}
        projectId={projectId}
        currency={dialog?.mode === 'edit' ? dialog.currency : undefined}
      />

      {dialog?.mode === 'delete' && (
        <DeleteCurrencyDialog
          open
          onOpenChange={(next) => {
            if (!next) setDialog(null);
          }}
          projectId={projectId}
          currency={dialog.currency}
        />
      )}
    </div>
  );
}
