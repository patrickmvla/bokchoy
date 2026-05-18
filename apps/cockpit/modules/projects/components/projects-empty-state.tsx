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
