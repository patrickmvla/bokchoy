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
import { useItems } from '../hooks/use-items';
import type { Item } from '../types';
import { DeleteItemDialog } from './delete-item-dialog';
import { ItemFormDialog } from './item-form-dialog';

type DialogState =
  | { mode: 'create' }
  | { mode: 'edit'; item: Item }
  | { mode: 'delete'; item: Item }
  | null;

export function ItemsList({ projectId }: { projectId: string }) {
  const { data: items, isLoading, isError, error } = useItems(projectId);
  const [dialog, setDialog] = useState<DialogState>(null);

  return (
    <div>
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">Items</h1>
          <p className="text-sm text-muted-foreground">
            Ownable things players hold in their inventory.
          </p>
        </div>
        <Button type="button" onClick={() => setDialog({ mode: 'create' })}>
          <PlusIcon className="mr-2 size-4" />
          New item
        </Button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 py-12 text-muted-foreground">
          <Spinner className="size-4" />
          Loading items…
        </div>
      )}

      {isError && (
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          Failed to load items: {error?.message ?? 'Unknown error.'}
        </div>
      )}

      {items && items.length === 0 && (
        <div className="rounded-md border border-dashed p-10 text-center text-sm text-muted-foreground">
          No items yet. Create your first one.
        </div>
      )}

      {items && items.length > 0 && (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Code</TableHead>
              <TableHead>Name</TableHead>
              <TableHead>Stackable</TableHead>
              <TableHead>Max</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-0" />
            </TableRow>
          </TableHeader>
          <TableBody>
            {items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="font-mono">{item.code}</TableCell>
                <TableCell>{item.displayName}</TableCell>
                <TableCell>{item.stackable ? 'yes' : 'no'}</TableCell>
                <TableCell>
                  {item.stackable ? (item.maxCount ?? '∞') : '—'}
                </TableCell>
                <TableCell>
                  <span
                    className={
                      item.active ? 'text-foreground' : 'text-muted-foreground'
                    }
                  >
                    {item.active ? 'active' : 'inactive'}
                  </span>
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDialog({ mode: 'edit', item })}
                  >
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setDialog({ mode: 'delete', item })}
                  >
                    Delete
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <ItemFormDialog
        open={dialog?.mode === 'create' || dialog?.mode === 'edit'}
        onOpenChange={(next) => {
          if (!next) setDialog(null);
        }}
        projectId={projectId}
        item={dialog?.mode === 'edit' ? dialog.item : undefined}
      />

      {dialog?.mode === 'delete' && (
        <DeleteItemDialog
          open
          onOpenChange={(next) => {
            if (!next) setDialog(null);
          }}
          projectId={projectId}
          item={dialog.item}
        />
      )}
    </div>
  );
}
