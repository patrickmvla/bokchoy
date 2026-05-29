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
import { useOffers } from '../hooks/use-offers';
import type { Offer } from '../types';
import { DeleteOfferDialog } from './delete-offer-dialog';
import { OfferFormDialog } from './offer-form-dialog';

type DialogState =
  | { mode: 'create' }
  | { mode: 'edit'; offer: Offer }
  | { mode: 'delete'; offer: Offer }
  | null;

export function OffersList({ projectId }: { projectId: string }) {
  const { data: offers, isLoading, isError, error } = useOffers(projectId);
  const [dialog, setDialog] = useState<DialogState>(null);

  function priceSummary(offer: Offer): string {
    if (offer.prices.length === 0) return '—';
    return offer.prices.map((p) => `${p.amount} ${p.currencyCode}`).join(' / ');
  }

  function itemSummary(offer: Offer): string {
    if (offer.items.length === 0) return '—';
    return offer.items.map((i) => `${i.quantity}× ${i.itemCode}`).join(', ');
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Offers</h1>
          <p className="text-sm text-muted-foreground">
            Priced bundles players can purchase.
          </p>
        </div>
        <Button type="button" onClick={() => setDialog({ mode: 'create' })}>
          <PlusIcon className="mr-2 size-4" />
          New offer
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-12 text-muted-foreground">
          <Spinner className="size-4" />
          Loading offers…
        </div>
      )}

      {isError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load offers: {error?.message ?? 'Unknown error.'}
        </div>
      )}

      {offers && offers.length === 0 && (
        <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
          No offers yet. Create one to start selling.
        </div>
      )}

      {offers && offers.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Price</TableHead>
              <TableHead>Grants</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {offers.map((offer) => (
              <TableRow key={offer.id}>
                <TableCell className="font-mono">{offer.code}</TableCell>
                <TableCell>{offer.displayName}</TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {priceSummary(offer)}
                </TableCell>
                <TableCell className="text-sm text-muted-foreground">
                  {itemSummary(offer)}
                </TableCell>
                <TableCell>
                  <span
                    className={
                      offer.active ? 'text-foreground' : 'text-muted-foreground'
                    }
                  >
                    {offer.active ? 'active' : 'inactive'}
                  </span>
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDialog({ mode: 'edit', offer })}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDialog({ mode: 'delete', offer })}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <OfferFormDialog
        open={dialog?.mode === 'create' || dialog?.mode === 'edit'}
        onOpenChange={(next) => {
          if (!next) setDialog(null);
        }}
        projectId={projectId}
        offer={dialog?.mode === 'edit' ? dialog.offer : undefined}
      />

      {dialog?.mode === 'delete' && (
        <DeleteOfferDialog
          open
          onOpenChange={(next) => {
            if (!next) setDialog(null);
          }}
          projectId={projectId}
          offer={dialog.offer}
        />
      )}
    </div>
  );
}
