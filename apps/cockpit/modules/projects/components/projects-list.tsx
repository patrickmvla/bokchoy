// Projects list view per [[cockpit/first-run-journey]] step 4 +
// [[cockpit/admin-list-endpoints-contract]] GET /v1/projects.
//
// Client Component that fetches via TanStack Query (use-projects hook) and
// branches between empty state and a Card grid. Per [[cockpit-stack-integration-research]]
// F6.11 + the auth-gate-pending caveat: switching to RSC fetching is owed
// when slice 8.3.2 lands.
//
// Card design: clickable card → /projects/{id} (project detail page lands
// in slice 8.4 next-cut). For now the link is rendered but the target page
// doesn't exist — operators land on Next.js's 404 if they click. Acceptable
// for slice 8.4 first cut; the list page itself works.

'use client';

import { ArrowUpRightIcon, FolderIcon } from 'lucide-react';
import Link from 'next/link';
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Spinner } from '@/components/ui/spinner';
import { useProjects } from '../hooks/use-projects';
import type { Project } from '../types';
import { ProjectsEmptyState } from './projects-empty-state';

export function ProjectsList() {
  const { data: projects, isLoading, isError, error } = useProjects();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-16 text-muted-foreground">
        <Spinner className="mr-2 size-4" />
        Loading projects…
      </div>
    );
  }

  if (isError) {
    return (
      <div className="rounded-md border border-destructive/50 bg-destructive/5 p-4 text-sm text-destructive">
        Failed to load projects: {error?.message ?? 'Unknown error.'}
      </div>
    );
  }

  if (!projects || projects.length === 0) {
    return <ProjectsEmptyState />;
  }

  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {projects.map((project) => (
        <ProjectCard key={project.id} project={project} />
      ))}
    </div>
  );
}

function ProjectCard({ project }: { project: Project }) {
  return (
    <Link
      href={`/projects/${project.id}`}
      className="group block focus:outline-none"
    >
      <Card className="h-full transition-colors hover:border-foreground/20">
        <CardHeader>
          <div className="mb-3 flex size-9 items-center justify-center rounded-md bg-muted">
            <FolderIcon className="size-4 text-muted-foreground" />
          </div>
          <CardTitle className="flex items-center justify-between text-base">
            <span className="truncate">{project.name}</span>
            <ArrowUpRightIcon className="size-4 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" />
          </CardTitle>
          <CardDescription className="font-mono text-xs">
            {project.slug}
          </CardDescription>
        </CardHeader>
      </Card>
    </Link>
  );
}
