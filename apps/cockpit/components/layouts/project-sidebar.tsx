'use client';

import {
  CoinsIcon,
  LayoutDashboardIcon,
  type LucideIcon,
  ReceiptIcon,
  SettingsIcon,
  UsersIcon,
} from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';

type Section = {
  label: string;
  /** Path segment under /project/[id]; '' = overview root. */
  segment: string;
  icon: LucideIcon;
  /** Disabled sections render as non-links until their routes ship (forward-looking IA per [[cockpit/cockpit-shape]] I1). */
  enabled: boolean;
};

// `enabled` flips to true as each section's routes land. Catalog → next pass; Transactions/Players → slice 8.6.
const SECTIONS: readonly Section[] = [
  { label: 'Overview', segment: '', icon: LayoutDashboardIcon, enabled: true },
  { label: 'Catalog', segment: 'catalog', icon: CoinsIcon, enabled: true },
  {
    label: 'Transactions',
    segment: 'transactions',
    icon: ReceiptIcon,
    enabled: false,
  },
  { label: 'Players', segment: 'players', icon: UsersIcon, enabled: false },
  {
    label: 'Settings',
    segment: 'settings',
    icon: SettingsIcon,
    enabled: false,
  },
];

export function ProjectSidebar({ projectId }: { projectId: string }) {
  const pathname = usePathname();
  const base = `/project/${projectId}`;

  return (
    <nav className="w-48 shrink-0 border-r px-3 py-6">
      <ul className="space-y-1">
        {SECTIONS.map((section) => {
          const Icon = section.icon;
          const href = section.segment ? `${base}/${section.segment}` : base;
          const active = section.segment
            ? pathname.startsWith(href)
            : pathname === base;

          if (!section.enabled) {
            return (
              <li key={section.label}>
                <span
                  className="flex cursor-not-allowed items-center gap-2 rounded-md px-3 py-2 text-sm text-muted-foreground/40"
                  title="Coming soon"
                >
                  <Icon className="size-4" />
                  {section.label}
                  <span className="ml-auto text-[10px] font-medium uppercase tracking-wide">
                    soon
                  </span>
                </span>
              </li>
            );
          }

          return (
            <li key={section.label}>
              <Link
                href={href}
                className={cn(
                  'flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors',
                  active
                    ? 'bg-muted font-medium text-foreground'
                    : 'text-muted-foreground hover:bg-muted/50 hover:text-foreground',
                )}
              >
                <Icon className="size-4" />
                {section.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
