import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { ProjectsList } from '@/modules/projects/components/projects-list';

export default function ProjectsPage() {
  return (
    <main className="mx-auto max-w-5xl px-4 py-10">
      <header className="mb-8 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            One project per game or environment. Each project has its own SDK
            API key, wallets, and catalog.
          </p>
        </div>
        <Button asChild>
          <Link href="/projects/new">New project</Link>
        </Button>
      </header>
      <ProjectsList />
    </main>
  );
}
