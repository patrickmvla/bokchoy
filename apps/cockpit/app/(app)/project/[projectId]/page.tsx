import { ProjectDetailView } from '@/modules/projects/components/project-detail-view';

interface ProjectOverviewPageProps {
  params: Promise<{ projectId: string }>;
}

export default async function ProjectOverviewPage({
  params,
}: ProjectOverviewPageProps) {
  const { projectId } = await params;
  return <ProjectDetailView projectId={projectId} />;
}
