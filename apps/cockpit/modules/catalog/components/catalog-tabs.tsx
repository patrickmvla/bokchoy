'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

const TABS = [
  { label: 'Currencies', segment: 'currencies' },
  { label: 'Items', segment: 'items' },
  { label: 'Offers', segment: 'offers' },
] as const;

export function CatalogTabs({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/project/${projectId}/catalog`;

  return (
    <nav className="flex gap-1 border-b">
      {TABS.map((tab) => {
        const href = `${base}/${tab.segment}`;
        const active = pathname.startsWith(href);
        return (
          <Link
            key={tab.segment}
            href={href}
            className={cn(
              '-mb-px border-b-2 px-3 py-2 text-sm transition-colors',
              active
                ? 'border-foreground font-medium text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
