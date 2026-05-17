// Code walkthrough section per [[marketing/v1-shape]] (v) — "3-4 sibling
// operations (credit, debit, balance read, history) demonstrating the API
// stays clean across the surface, not just on one cherry-picked call."
//
// State at M-5 land (2026-05-17):
//   • credit + debit  — SHIPPED. @bokchoy/sdk-node M-4 exposes both with the
//                       friendly-name API; the snippets here run against a
//                       live API key.
//   • balance + history — PLANNED. No SDK methods yet (M-4 supersession
//                         scoped them out); no backend endpoints either.
//                         Shown here for shape commitment so a future M-5.5
//                         doesn't reshuffle the API.
//
// "Coming soon" treatment: opacity-60 + badge. Reading the snippet, a
// customer immediately sees the API shape is committed, but trying to call
// it today will fail (404 from the backend). Documentation pass owed to
// /docs route. Per [[marketing/v1-shape]] failure-mode defense: marketing
// snippets that don't run on first-touch ARE the F-mode this rule was
// written to prevent — the muted styling + section-heading honesty is the
// mitigation we negotiated up-front.
//
// Section heading separates "Today, you can:" from "Coming soon:" so a
// reader scanning headers sees the staging before reading code.
//
// All Server Component. CodeBlock is async-rendered at build/request time
// via shiki. Lucide Clock icon on the "Coming soon" badges.

import { Clock } from 'lucide-react';
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

const SNIPPET_BALANCE = `// Coming soon
const balance = await bokchoy.wallets.balance({
  player: 'player_123',
  currency: 'gems',
});

balance.amount; // '750.0000'`;

const SNIPPET_HISTORY = `// Coming soon
const history = await bokchoy.wallets.history({
  player: 'player_123',
  currency: 'gems',
  limit: 50,
});

for (const txn of history.transactions) {
  console.log(txn.kind, txn.amount, txn.reasonCode);
}`;

interface SnippetCardProps {
  title: string;
  body: string;
  code: string;
  comingSoon?: boolean;
}

function SnippetCard({
  title,
  body,
  code,
  comingSoon = false,
}: SnippetCardProps) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-2">
        <h3
          className={
            comingSoon
              ? 'text-muted-foreground text-base font-medium'
              : 'text-foreground text-base font-medium'
          }
        >
          {title}
        </h3>
        {comingSoon ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            <Clock className="h-3 w-3" aria-hidden />
            Coming soon
          </span>
        ) : null}
      </div>
      <p className="text-sm text-muted-foreground">{body}</p>
      <CodeBlock code={code} muted={comingSoon} />
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

        {/* Today */}
        <div className="flex flex-col gap-6">
          <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Today
          </h3>
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
          </div>
        </div>

        {/* Coming soon */}
        <div className="flex flex-col gap-6">
          <h3 className="text-sm font-medium uppercase tracking-wide text-muted-foreground">
            Coming soon
          </h3>
          <div className="grid gap-8 lg:grid-cols-2">
            <SnippetCard
              title="Read a wallet balance"
              body="Precision-preserving NUMERIC(20,4) string return — no float-rounding loss past 2^53."
              code={SNIPPET_BALANCE}
              comingSoon
            />
            <SnippetCard
              title="Paginate transaction history"
              body="Replay the audit log per wallet — every credit, debit, and reason code, in chronological order."
              code={SNIPPET_HISTORY}
              comingSoon
            />
          </div>
        </div>
      </div>
    </section>
  );
}
