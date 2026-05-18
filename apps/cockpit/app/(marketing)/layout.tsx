/** Marketing route group chrome — public, no auth gate (proxy.ts matcher excludes these paths). */

import type { ReactNode } from 'react';
import { MarketingFooter } from '@/modules/marketing/components/footer';
import { MarketingTopNav } from '@/modules/marketing/components/top-nav';

export default function MarketingLayout({ children }: { children: ReactNode }) {
  return (
    <>
      <MarketingTopNav />
      <main className="flex-1">{children}</main>
      <MarketingFooter />
    </>
  );
}
