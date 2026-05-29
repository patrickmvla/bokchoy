'use client';

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
import { useDeleteOffer } from '../hooks/use-delete-offer';
import type { Offer } from '../types';

interface DeleteOfferDialogProps {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  projectId: string;
  offer: Offer;
}

// Offers own their prices/items, so the backend deletes the whole aggregate — no RESOURCE_IN_USE here.
export function DeleteOfferDialog({
  open,
  onOpenChange,
  projectId,
  offer,
}: DeleteOfferDialogProps) {
  const deleteMutation = useDeleteOffer(projectId);

  function handleConfirm() {
    deleteMutation.mutate(offer.id, {
      onSuccess: () => {
        toast.success(`Offer ${offer.code} deleted`);
        onOpenChange(false);
      },
      onError: (error) => toast.error(userMessage(error)),
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Delete {offer.code}?</DialogTitle>
          <DialogDescription>
            This removes the offer and its prices and item grants. Past
            purchases are unaffected. This cannot be undone.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
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
              'Delete offer'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
