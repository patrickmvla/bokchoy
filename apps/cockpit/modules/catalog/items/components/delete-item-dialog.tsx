'use client';

import { useState } from 'react';
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
import { Spinner } from '@/components/ui/spinner';
import { userMessage } from '@/lib/error-messages';
import { CatalogApiError } from '../../lib/catalog-api';
import { useDeleteItem } from '../hooks/use-delete-item';
import type { Item } from '../types';

type RemovableRef = { type: 'offer'; code: string };
type BlockingRef = { type: string; count: number };
type InUse = { removable: RemovableRef[]; blocking: BlockingRef[] };

interface DeleteItemDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  projectId: string;
  item: Item;
}

export function DeleteItemDialog({
  open,
  onOpenChange,
  projectId,
  item,
}: DeleteItemDialogProps) {
  const deleteMutation = useDeleteItem(projectId);
  const [inUse, setInUse] = useState<InUse | null>(null);

  function close(next: boolean) {
    if (!next) setInUse(null);
    onOpenChange(next);
  }

  function handleConfirm() {
    deleteMutation.mutate(item.id, {
      onSuccess: () => {
        toast.success(`Item ${item.code} deleted`);
        close(false);
      },
      onError: (error) => {
        if (
          error instanceof CatalogApiError &&
          error.code === 'RESOURCE_IN_USE'
        ) {
          setInUse({
            removable:
              (error.detail.removableReferences as
                | RemovableRef[]
                | undefined) ?? [],
            blocking:
              (error.detail.blockingReferences as BlockingRef[] | undefined) ??
              [],
          });
          return;
        }
        toast.error(userMessage(error));
      },
    });
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>
            {inUse ? 'Cannot delete this item' : `Delete ${item.code}?`}
          </DialogTitle>
          <DialogDescription>
            {inUse
              ? `${item.displayName} is still referenced:`
              : 'This removes the item from your catalog. This cannot be undone.'}
          </DialogDescription>
        </DialogHeader>

        {inUse && (
          <div className="space-y-3 text-sm">
            {inUse.removable.length > 0 && (
              <div>
                <p className="font-medium">
                  Remove it from these offers first:
                </p>
                <ul className="mt-1 list-inside list-disc text-muted-foreground">
                  {inUse.removable.map((ref) => (
                    <li key={ref.code} className="font-mono">
                      {ref.code}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {inUse.blocking.map((ref) => (
              <p
                key={ref.type}
                className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-amber-700 dark:text-amber-500"
              >
                Held by {ref.count} player{ref.count === 1 ? '' : 's'}. Items in
                players' inventories can't be deleted — edit the item and set it
                inactive instead.
              </p>
            ))}
          </div>
        )}

        <DialogFooter>
          {inUse ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => close(false)}
            >
              Close
            </Button>
          ) : (
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => close(false)}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="destructive"
                onClick={handleConfirm}
                disabled={deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <>
                    <Spinner className="mr-2 size-4" />
                    Deleting…
                  </>
                ) : (
                  'Delete item'
                )}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
