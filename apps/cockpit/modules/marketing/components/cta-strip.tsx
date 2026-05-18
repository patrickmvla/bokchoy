import Link from 'next/link';
import { Button } from '@/components/ui/button';

export function MarketingCtaStrip() {
  return (
    <section className="bg-muted/30">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-6 px-4 py-20 text-center sm:py-24">
        <h2 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Ship the wallet, not the wallet plumbing
        </h2>
        <p className="max-w-xl text-base text-muted-foreground">
          BokChoy is free during private beta. Get an API key, paste the
          snippet, and credit your first player in under a minute.
        </p>
        <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
          <Button asChild size="lg">
            <Link href="/sign-up">Start free</Link>
          </Button>
          <Button asChild size="lg" variant="outline">
            <Link href="/docs">Read the docs</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
