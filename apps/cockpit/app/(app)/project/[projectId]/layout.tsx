import type { ReactNode } from 'react';
import { ProjectSidebar } from '@/components/layouts/project-sidebar';

/** Project-scoped chrome. projectId is the URL path scope per [[cockpit/active-project-scope]]. */
export default async function ProjectLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <div className="flex">
      <ProjectSidebar projectId={projectId} />
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
}
