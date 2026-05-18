/** Visible-once API key modal. Per [[cockpit/first-run-journey]] step 7 K1 — never persists plaintext client-side. */

'use client';

import { CheckIcon, CopyIcon, KeyIcon } from 'lucide-react';
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

interface ApiKeyModalProps {
  open: boolean;
  /** Parent should navigate after dismiss. */
  onDismiss: () => void;
  /** Plaintext key — null hides the modal entirely. */
  apiKey: string | null;
  label?: string;
}

export function ApiKeyModal({
  open,
  onDismiss,
  apiKey,
  label = 'Your API key',
}: ApiKeyModalProps) {
  const [copied, setCopied] = useState(false);

  if (!apiKey) {
    return null;
  }

  async function handleCopy() {
    if (!apiKey) return;
    try {
      await navigator.clipboard.writeText(apiKey);
      setCopied(true);
      toast.success('Copied to clipboard');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error(
        'Copy failed — select the key text and copy manually with Ctrl/Cmd-C.',
      );
    }
  }

  function handleOpenChange(next: boolean) {
    if (!next) onDismiss();
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="mb-2 flex size-10 items-center justify-center rounded-full bg-primary/10">
            <KeyIcon className="size-5 text-primary" />
          </div>
          <DialogTitle>{label}</DialogTitle>
          <DialogDescription>
            Save this key now — it won't be shown again. Anyone with this key
            can call the BokChoy API on behalf of this project.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-2">
          <div className="flex items-stretch gap-2">
            <pre className="flex-1 select-all overflow-x-auto rounded-md border bg-muted px-3 py-2 font-mono text-sm">
              <code>{apiKey}</code>
            </pre>
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={handleCopy}
              aria-label={copied ? 'Copied' : 'Copy API key'}
            >
              {copied ? (
                <CheckIcon className="size-4" />
              ) : (
                <CopyIcon className="size-4" />
              )}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Store this key in a secure secret manager. The next page shows only
            the key prefix.
          </p>
        </div>

        <DialogFooter>
          <Button type="button" onClick={onDismiss}>
            I've saved it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
