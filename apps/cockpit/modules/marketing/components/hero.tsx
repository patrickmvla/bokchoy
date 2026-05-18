import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { CodeBlock } from './code-block';

const HERO_SNIPPET = `import { BokChoy } from '@bokchoy/sdk-node';

const bokchoy = new BokChoy({ apiKey: process.env.BOKCHOY_API_KEY });

await bokchoy.wallets.credit({
  player: 'player_123',
  amount: 100,
  currency: 'gems',
  reason: 'level_up_reward',
});`;

export function MarketingHero() {
  return (
    <section className="border-b bg-background">
      <div className="mx-auto grid max-w-6xl gap-12 px-4 py-20 sm:py-28 lg:grid-cols-2 lg:gap-16">
        <div className="flex flex-col justify-center gap-6">
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Wallet infrastructure for game economies
          </h1>
          <p className="max-w-xl text-base text-muted-foreground sm:text-lg">
            Audit-log-replayable credits and debits over a Postgres ledger you
            own. Built for game devs shipping currencies, IAP, and loot without
            rebuilding the wallet primitives every time.
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <Button asChild size="lg">
              <Link href="/sign-up">Start free</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/docs">Read the docs</Link>
            </Button>
          </div>
          <p className="pt-2 text-xs text-muted-foreground">
            Free during private beta.{' '}
            <a
              href="mailto:hello@bokchoy.com"
              className="underline-offset-4 hover:underline"
            >
              Talk to us
            </a>
            .
          </p>
        </div>
        <div className="flex items-center">
          <CodeBlock code={HERO_SNIPPET} className="w-full" />
        </div>
      </div>
    </section>
  );
}
