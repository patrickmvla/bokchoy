// Project-create route at bokchoy.com/projects/new per [[cockpit/first-run-journey]]
// step 5. Route group (app) is the auth-gated cockpit shell per
// [[cockpit/file-structure]] § route-segments — auth-gate enforcement via
// (app)/layout.tsx is DEFERRED to slice 8.3.2 (Better Auth client provider
// + lib/session.ts RSC session-read). For now this page is publicly reachable;
// flag tracked in [[cockpit/shadcn-setup]] state.md and the auth-gate slice.
//
// This is a Server Component (no 'use client' — outer route bodies stay
// server-rendered per [[cockpit-stack-integration-research]] F6.11). The
// Client Component <CreateProjectForm> handles the interactive form state.

import { CreateProjectForm } from '@/modules/projects/components/create-project-form';

export default function CreateProjectPage() {
  return (
    <main className="mx-auto max-w-xl px-4 py-12">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          Create a project
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Set up a new BokChoy project. You can change these details later.
        </p>
      </header>
      <CreateProjectForm />
    </main>
  );
}
