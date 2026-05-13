// Cockpit chrome header: org name + user email + sign-out.
//
// Renders inside the (app)/ auth-gated layout. The signed-in user comes
// down as a prop from the layout (which already called getSession for the
// auth gate — no point re-fetching client-side). The org info comes from
// useOrgMe (TanStack Query — cached 5min, refetched on mount).
//
// Sign-out: authClient.signOut() clears the session cookie + drops the
// query cache (so a fresh sign-in doesn't show stale data), then
// router.push('/sign-in'). On failure, surface via userMessage().
//
// Design: minimal top bar — left side shows org name (or spinner during
// initial load); right side shows user email + sign-out button. Keep the
// chrome unobtrusive; the cockpit's main content is what the operator is
// here for.

'use client';

import { useQueryClient } from '@tanstack/react-query';
import { LogOutIcon } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Spinner } from '@/components/ui/spinner';
import { authClient } from '@/lib/auth-client';
import { userMessage } from '@/lib/error-messages';
import { useOrgMe } from '../hooks/use-org-me';

interface AppHeaderProps {
  userEmail: string;
}

export function AppHeader({ userEmail }: AppHeaderProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { data: org, isLoading: orgLoading } = useOrgMe();
  const [signOutPending, setSignOutPending] = useState(false);

  async function handleSignOut() {
    setSignOutPending(true);
    try {
      const { error } = await authClient.signOut();
      if (error) {
        toast.error(userMessage(error));
        setSignOutPending(false);
        return;
      }
      queryClient.clear();
      router.push('/sign-in');
    } catch (err) {
      toast.error(userMessage(err));
      setSignOutPending(false);
    }
  }

  return (
    <header className="border-b bg-background">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <div className="flex items-center gap-3 min-w-0">
          <span className="font-heading text-sm font-semibold">BokChoy</span>
          {orgLoading ? (
            <Spinner className="size-3 text-muted-foreground" />
          ) : org ? (
            <span className="truncate text-sm text-muted-foreground">
              <span className="mx-1 text-foreground/30">/</span>
              {org.name}
              <span className="ml-2 rounded-sm bg-muted px-1.5 py-0.5 text-xs">
                {org.member.role}
              </span>
            </span>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <span className="hidden sm:inline truncate text-sm text-muted-foreground">
            {userEmail}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleSignOut}
            disabled={signOutPending}
          >
            {signOutPending ? (
              <Spinner className="mr-2 size-4" />
            ) : (
              <LogOutIcon className="mr-2 size-4" />
            )}
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
