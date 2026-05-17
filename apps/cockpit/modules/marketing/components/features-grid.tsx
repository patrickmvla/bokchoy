// 3-pillar features section per [[marketing/v1-shape]] (iv). Lootlocker
// pattern (3 pillars per `[[marketing/landing-patterns-research]]` Source 4).
// Pillars are NOT equally weighted per (iv) — audit-log is load-bearing;
// Postgres-native and defense-in-depth support but don't lead.
//
// Visual weighting on the primary pillar:
//   • Wider grid span on lg+ (lg:col-span-2 vs default 1)
//   • Primary tone (text-foreground) for heading; muted secondary/tertiary
//   • Heading "Replayable from the event log" — answers the most-asked
//     support question in any wallet/ledger product per (iv) defense
//     ("a player says they didn't get their gems — what happened?")
//
// Anchor target #features for the top-nav "Product" link per the M-3 top-nav
// (NAV_ITEMS[0].href === '/#features'). Placing the id on the outer section
// so the browser scrolls the heading into view, not mid-content.
//
// Server Component. Icons are lucide-react (pre-installed). Per
// `[[cockpit-stack-integration-research]]` F6 row 11 lucide icons are tree-
// shakeable and safe to import in RSC.
//
// Copy is PLACEHOLDER QUALITY per M-5 contract — pillar headlines and body
// text are the vault's sketch from (iv); a separate authoring session
// refines them.

import { History, Lock, Server } from 'lucide-react';
import type { ReactNode } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

interface Pillar {
  icon: ReactNode;
  title: string;
  body: string;
}

const PILLAR_PRIMARY: Pillar = {
  icon: <History className="h-5 w-5" aria-hidden />,
  title: 'Replayable from the event log',
  body: 'Every credit and debit is recorded as an immutable audit row. When a player says "I didn\'t get my gems," you replay the trace — idempotency keys, source events, balance snapshots — and answer with certainty, not guesswork.',
};

const PILLAR_SECONDARY: Pillar = {
  icon: <Server className="h-5 w-5" aria-hidden />,
  title: 'Postgres-native, your schema',
  body: 'Your wallet rows, transactions, and reason codes live in standard Postgres tables you can query, back up, and reason about. No proprietary query language, no NoSQL lock-in.',
};

const PILLAR_TERTIARY: Pillar = {
  icon: <Lock className="h-5 w-5" aria-hidden />,
  title: 'Defense in depth',
  body: 'Proxy-tier auth, row-level-security tenancy isolation, admin-gate authorization, and idempotency middleware — four independent layers between request and your ledger.',
};

export function MarketingFeaturesGrid() {
  return (
    <section id="features" className="border-b bg-muted/30 scroll-mt-16">
      <div className="mx-auto grid max-w-6xl gap-6 px-4 py-20 sm:py-24 lg:grid-cols-3">
        {/* PRIMARY pillar spans 2 cols on lg+; secondary + tertiary stack into the third column. */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center gap-2 text-foreground">
              {PILLAR_PRIMARY.icon}
              <CardTitle className="text-xl">{PILLAR_PRIMARY.title}</CardTitle>
            </div>
            <CardDescription className="pt-2 text-base text-foreground/80">
              {PILLAR_PRIMARY.body}
            </CardDescription>
          </CardHeader>
        </Card>
        <div className="flex flex-col gap-6">
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-muted-foreground">
                {PILLAR_SECONDARY.icon}
                <CardTitle className="text-base">
                  {PILLAR_SECONDARY.title}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {PILLAR_SECONDARY.body}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <div className="flex items-center gap-2 text-muted-foreground">
                {PILLAR_TERTIARY.icon}
                <CardTitle className="text-base">
                  {PILLAR_TERTIARY.title}
                </CardTitle>
              </div>
            </CardHeader>
            <CardContent>
              <p className="text-sm text-muted-foreground">
                {PILLAR_TERTIARY.body}
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    </section>
  );
}
