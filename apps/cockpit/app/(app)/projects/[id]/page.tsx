// Project detail route at bokchoy.com/projects/{id} per
// [[cockpit/first-run-journey]] step 7 (post-create redirect target) + step 11
// (T2 verify-key polling).
//
// Server Component shell — auth-gate enforcement via (app)/layout.tsx is still
// DEFERRED to slice 8.3.2. The interactive verify-key UI lives in the Client
// Component <ProjectDetailView> below; it owns the TanStack Query polling
// loop per [[cockpit/admin-list-endpoints-contract]] (A1).
//
// Next.js 16 dynamic params are async (Promise<{ id }>) — the page awaits the
// param before passing to the client component.

import { ProjectDetailView } from '@/modules/projects/components/project-detail-view';

interface ProjectDetailPageProps {
  params: Promise<{ id: string }>;
}

export default async function ProjectDetailPage({
  params,
}: ProjectDetailPageProps) {
  const { id } = await params;
  return <ProjectDetailView projectId={id} />;
}
