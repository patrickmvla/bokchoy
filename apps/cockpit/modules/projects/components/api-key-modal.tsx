// Visible-once API-key modal per [[cockpit/first-run-journey]] step 7 + K1.
//
// Pattern: shadcn <Dialog> primitive. Displays the plaintext apiKey ONCE with
// a copy button + prominent warning. Dismiss → navigate to /projects (or to
// the project detail page when slice 8.4 ships /projects/{id}). K1 visible-once
// matches [[wallet-http-contract]] slice 8.1a HMAC-stored key model — the
// plaintext lives only in the response → React state → this modal; never
// persisted client-side beyond the modal's lifetime.
//
// Copy UX: navigator.clipboard.writeText() with sonner toast on success.
// Fallback for clipboard-API-blocked contexts (per [[cockpit/first-run-journey]]
// *Mitigations*): the key is still rendered as selectable text so the operator
// can hand-select + copy manually. The toast surfaces both success and failure
// states so the operator knows whether the clipboard call worked.
//
// Modal is controlled (open / onOpenChange via props). Parent owns the
// open/closed state — typical pattern when the modal is triggered by an
// async operation (form submission) rather than a user gesture.

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
  /** Whether the modal is visible. Parent owns this state. */
  open: boolean;
  /** Fires when the user dismisses the modal (X button, ESC, backdrop click,
   * or the "I've saved it" confirm button). Parent should navigate after. */
  onDismiss: () => void;
  /** Plaintext API key — shown ONCE. Parent passes null when no key is
   * available; modal renders nothing in that state. */
  apiKey: string | null;
  /** Human-readable label for the key, displayed above the value. Defaults
   * to "Your API key". */
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
      // Reset the "copied" indicator after 2s so the operator can copy again
      // if needed (clipboard contents may be overwritten by other apps).
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
