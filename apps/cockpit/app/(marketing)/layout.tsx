// Marketing route group layout per [[marketing/v1-shape]] Cascade
// obligation #3 + (i). Wraps `/`, `/pricing`, and the future `/docs/...`
// route in a shared top-nav + footer chrome.
//
// NO auth gate. Marketing routes are public — `apps/cockpit/proxy.ts`
// matcher is `['/projects', '/projects/:path*']` per
// [[cockpit/nextjs-16-proxy-research]] F7 + slice 8.3.6, so these paths
// are unmatched and pass through with no cookie check. Confirmed clean
// by inspection of `proxy.ts` config.
//
// Server Component per [[cockpit-stack-integration-research]] F6 row 11.
// No client-side state at this layer; CTA buttons in child pages are
// the only client-interactive leaves (per `[[marketing/v1-shape]]`
// Production-grade gates).
//
// Layout shape: header + main + footer in a flex column. The root layout
// (`app/layout.tsx`) already provides `<body className="min-h-full flex
// flex-col">`, so this layout's children take the flex-grow space and
// the footer sticks to the bottom on short pages.

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
