// Projects index route at bokchoy.com/projects per [[cockpit/first-run-journey]]
// step 4 + [[cockpit/cockpit-shape]] I1 (cockpit nav anchor).
//
// Server Component that renders the Client Component <ProjectsList> — the list
// itself fetches via TanStack Query (browser-side) at slice 8.4 first cut.
// Migration to RSC fetching is owed when slice 8.3.2 lands the auth gate +
// modules/auth/lib/session.ts per [[cockpit-stack-integration-research]] F5.6.
//
// Route group (app)/ is the auth-gated cockpit shell; auth-gate enforcement
// via (app)/layout.tsx is DEFERRED to slice 8.3.2. For now this page is
// publicly reachable; flag tracked.

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
