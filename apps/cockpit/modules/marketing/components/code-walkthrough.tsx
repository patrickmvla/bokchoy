/** Code walkthrough section. Per [[marketing/v1-shape]] (v) — 4 sibling SDK operations. */

import { CodeBlock } from './code-block';

const SNIPPET_CREDIT = `await bokchoy.wallets.credit({
  player: 'player_123',
  amount: 50,
  currency: 'gems',
  reason: 'daily_login_bonus',
  metadata: { day_streak: 7 },
});`;

const SNIPPET_DEBIT = `await bokchoy.wallets.debit({
  player: 'player_123',
  amount: 200,
  currency: 'gems',
  reason: 'shop_purchase',
  sourceEventId: 'order_8f3a1c',
});`;

const SNIPPET_BALANCE = `const wallet = await bokchoy.wallets.balance({
  player: 'player_123',
  currency: 'gems',
});

wallet.balance; // '750.0000' — precision-preserving string`;

const SNIPPET_HISTORY = `const history = await bokchoy.wallets.history({
  player: 'player_123',
  currency: 'gems',
  limit: 50,
});

for (const txn of history.data) {
  console.log(txn.kind, txn.amount, txn.reasonCode);
}`;

interface SnippetCardProps {
  title: string;
  body: string;
  code: string;
}

function SnippetCard({ title, body, code }: SnippetCardProps) {
  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-foreground text-base font-medium">{title}</h3>
      <p className="text-sm text-muted-foreground">{body}</p>
      <CodeBlock code={code} />
    </div>
  );
}

export function MarketingCodeWalkthrough() {
  return (
    <section className="border-b bg-background">
      <div className="mx-auto flex max-w-6xl flex-col gap-12 px-4 py-20 sm:py-24">
        <div className="flex flex-col gap-3">
          <h2 className="text-3xl font-semibold tracking-tight">
            The same API, across the surface
          </h2>
          <p className="max-w-2xl text-base text-muted-foreground">
            One friendly-name API for the operations you ship on day one. The
            same shape extends as the surface grows.
          </p>
        </div>

        <div className="grid gap-8 lg:grid-cols-2">
          <SnippetCard
            title="Credit a player"
            body="Lazy-creates the wallet on first call; idempotency keys are auto-generated for safe SDK retries."
            code={SNIPPET_CREDIT}
          />
          <SnippetCard
            title="Debit a player"
            body="Raises InsufficientFunds with the wallet's current balance when the post-debit value would go negative."
            code={SNIPPET_DEBIT}
          />
          <SnippetCard
            title="Read a wallet balance"
            body="Precision-preserving NUMERIC(20,4) string return — no float-rounding loss past 2^53. Unknown players return 0 without an error path."
            code={SNIPPET_BALANCE}
          />
          <SnippetCard
            title="Paginate transaction history"
            body="Newest-first audit log per wallet — every credit and debit with reason code, sourceEventId, and idempotency-replay-safe ordering."
            code={SNIPPET_HISTORY}
          />
        </div>
      </div>
    </section>
  );
}
