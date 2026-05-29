'use client';

import { ChevronsUpDownIcon, FolderIcon, PlusIcon } from 'lucide-react';
import { usePathname, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useProjects } from '../hooks/use-projects';

/**
 * Active-project switcher per [[cockpit/active-project-scope]]: the active project is the URL path
 * segment; selecting one router.push-es to /project/{id}/{section}, truncating to the section root.
 * Renders nothing off a /project/* route (e.g. the projects list) — there is no active project there.
 */
export function ProjectSwitcher() {
  const pathname = usePathname();
  const router = useRouter();

  // ['project', id, section?, ...rest] — section preserved on switch, deeper segments dropped.
  const segments = pathname.split('/').filter(Boolean);
  const activeId = segments[0] === 'project' ? segments[1] : null;
  const section = segments[2];

  const { data: projects } = useProjects();

  if (!activeId) return null;

  const current = projects?.find((p) => p.id === activeId);

  function go(projectId: string) {
    router.push(
      section ? `/project/${projectId}/${section}` : `/project/${projectId}`,
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant="ghost" size="sm" className="gap-2">
          <FolderIcon className="size-4 text-muted-foreground" />
          <span className="max-w-48 truncate">
            {current?.name ?? 'Project'}
          </span>
          <ChevronsUpDownIcon className="size-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-56">
        <DropdownMenuLabel>Switch project</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {projects?.map((project) => (
          <DropdownMenuItem
            key={project.id}
            onSelect={() => go(project.id)}
            className={project.id === activeId ? 'font-medium' : undefined}
          >
            <FolderIcon className="size-4 text-muted-foreground" />
            <span className="truncate">{project.name}</span>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => router.push('/projects/new')}>
          <PlusIcon className="size-4" />
          New project
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => router.push('/projects')}>
          All projects
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
