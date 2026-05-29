import type { ReactNode } from 'react';
import { CatalogTabs } from '@/modules/catalog/components/catalog-tabs';

/** Catalog sub-nav (Currencies / Items / Offers) shared across the three editors. */
export default async function CatalogLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return (
    <div className="px-8 py-8">
      <CatalogTabs projectId={projectId} />
      <div className="mt-6">{children}</div>
    </div>
  );
}
