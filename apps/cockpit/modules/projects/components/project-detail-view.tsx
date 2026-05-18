'use client';

import {
  CheckCircle2Icon,
  CircleAlertIcon,
  ClockIcon,
  KeyIcon,
} from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
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
import { ProjectApiError } from '../api/create-project';
import { useProject } from '../hooks/use-project';
import { useRevokeApiKey } from '../hooks/use-revoke-api-key';
import type { ApiKey, ProjectDetail } from '../types';

export function ProjectDetailView({ projectId }: { projectId: string }) {
  const { data: project, isLoading, isError, error } = useProject(projectId);

  if (isLoading) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Spinner className="mr-2 size-4" />
          Loading project…
        </div>
      </main>
    );
  }

  if (isError || !project) {
    return (
      <main className="mx-auto max-w-5xl px-4 py-10">
        <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
          <p className="font-medium">Failed to load project</p>
          <p className="mt-1">{error?.message ?? 'Unknown error.'}</p>
          <Link
            href="/projects"
            className="mt-3 inline-block text-sm underline underline-offset-4"
          >
            Back to projects
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <nav className="mb-2 text-sm text-muted-foreground">
        <Link href="/projects" className="hover:text-foreground">
          Projects
        </Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{project.name}</span>
      </nav>
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          {project.name}
        </h1>
        <p className="mt-1 font-mono text-sm text-muted-foreground">
          {project.slug}
        </p>
      </header>

      <div className="mb-8">
        <VerifyKeyPanel project={project} />
      </div>

      <ApiKeysSection projectId={project.id} apiKeys={project.apiKeys} />
    </main>
  );
}

function VerifyKeyPanel({ project }: { project: ProjectDetail }) {
  const verifiedKey = project.apiKeys.find(
    (k) => k.lastUsedAt !== null && k.revokedAt === null,
  );

  if (verifiedKey) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CheckCircle2Icon className="size-5 text-emerald-600 dark:text-emerald-500" />
            <CardTitle className="text-base">Key verified</CardTitle>
          </div>
          <CardDescription>
            Last used {formatRelative(verifiedKey.lastUsedAt as string)} —
            <span className="font-mono"> {verifiedKey.keyPrefix}…</span>
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  if (project.apiKeys.length === 0) {
    return (
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <CircleAlertIcon className="size-5 text-muted-foreground" />
            <CardTitle className="text-base">No API keys yet</CardTitle>
          </div>
          <CardDescription>
            Issue an API key to start making SDK calls.
          </CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <Spinner className="size-4" />
          <CardTitle className="text-base">
            Waiting for first SDK call…
          </CardTitle>
        </div>
        <CardDescription>
          Install the BokChoy SDK and make a call from your code. This panel
          updates within a few seconds of the first authenticated request.
        </CardDescription>
      </CardHeader>
    </Card>
  );
}

function ApiKeysSection({
  projectId,
  apiKeys,
}: {
  projectId: string;
  apiKeys: ApiKey[];
}) {
  if (apiKeys.length === 0) return null;

  return (
    <section>
      <h2 className="mb-4 text-sm font-medium text-muted-foreground">
        API keys
      </h2>
      <div className="space-y-2">
        {apiKeys.map((apiKey) => (
          <ApiKeyRow key={apiKey.id} projectId={projectId} apiKey={apiKey} />
        ))}
      </div>
    </section>
  );
}

function ApiKeyRow({
  projectId,
  apiKey,
}: {
  projectId: string;
  apiKey: ApiKey;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const revoked = apiKey.revokedAt !== null;
  return (
    <Card size="sm">
      <CardContent className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <div className="flex items-center gap-2">
          <KeyIcon className="size-4 text-muted-foreground" />
          <span className="font-mono text-sm">{apiKey.keyPrefix}…</span>
        </div>
        <span className="text-sm">{apiKey.name}</span>
        <span className="ml-auto flex items-center gap-3 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <ClockIcon className="size-3" />
            created {formatRelative(apiKey.createdAt)}
          </span>
          {apiKey.lastUsedAt && (
            <span>last used {formatRelative(apiKey.lastUsedAt)}</span>
          )}
          {revoked && (
            <span className="rounded-sm bg-destructive/10 px-2 py-0.5 text-destructive">
              revoked
            </span>
          )}
        </span>
        {!revoked && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setConfirmOpen(true)}
          >
            Revoke
          </Button>
        )}
        {!revoked && (
          <RevokeApiKeyDialog
            open={confirmOpen}
            onOpenChange={setConfirmOpen}
            projectId={projectId}
            apiKey={apiKey}
          />
        )}
      </CardContent>
    </Card>
  );
}

// ALREADY_REVOKED is a benign race — dismiss without toast.
function RevokeApiKeyDialog({
  open,
  onOpenChange,
  projectId,
  apiKey,
}: {
  open: boolean;
  onOpenChange: (next: boolean) => void;
  projectId: string;
  apiKey: ApiKey;
}) {
  const revokeMutation = useRevokeApiKey();

  function handleConfirm() {
    revokeMutation.mutate(
      { projectId, keyId: apiKey.id },
      {
        onSuccess: () => {
          toast.success(`API key ${apiKey.keyPrefix}… revoked`);
          onOpenChange(false);
        },
        onError: (error) => {
          if (
            error instanceof ProjectApiError &&
            error.code === 'ALREADY_REVOKED'
          ) {
            toast.message('Key was already revoked.');
            onOpenChange(false);
            return;
          }
          toast.error(userMessage(error));
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Revoke this API key?</DialogTitle>
          <DialogDescription>
            SDK calls using{' '}
            <span className="font-mono">{apiKey.keyPrefix}…</span> will stop
            working immediately. This cannot be undone — issue a new key if you
            need access again.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={revokeMutation.isPending}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            onClick={handleConfirm}
            disabled={revokeMutation.isPending}
          >
            {revokeMutation.isPending ? (
              <>
                <Spinner className="mr-2 size-4" />
                Revoking…
              </>
            ) : (
              'Revoke key'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Intl.RelativeTimeFormat rounds aggressively; verify-loop needs sub-minute fidelity.
function formatRelative(iso: string): string {
  const then = new Date(iso).getTime();
  const seconds = Math.max(0, Math.floor((Date.now() - then) / 1000));
  if (seconds < 5) return 'just now';
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86_400) return `${Math.floor(seconds / 3600)}h ago`;
  return `${Math.floor(seconds / 86_400)}d ago`;
}
