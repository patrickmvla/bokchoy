// Projects empty state per [[cockpit/first-run-journey]] step 4.
//
// Shown when GET /v1/projects returns `[]` (new organization, no projects
// created yet). Prompts the operator to create their first project via a CTA
// linking to /projects/new — entry point for the form scaffold in
// modules/projects/components/create-project-form.tsx.
//
// Pattern: shadcn <Empty> primitive composition. EmptyMedia + EmptyTitle +
// EmptyDescription + EmptyContent (CTA button).

import { FolderPlusIcon } from 'lucide-react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';

export function ProjectsEmptyState() {
  return (
    <Empty className="border border-dashed py-16">
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <FolderPlusIcon className="size-6" />
        </EmptyMedia>
        <EmptyTitle>Create your first project</EmptyTitle>
        <EmptyDescription>
          A project groups players, wallets, catalog items, and transactions.
          You'll get an API key to call BokChoy from your game code.
        </EmptyDescription>
      </EmptyHeader>
      <EmptyContent>
        <Button asChild>
          <Link href="/projects/new">New project</Link>
        </Button>
      </EmptyContent>
    </Empty>
  );
}
