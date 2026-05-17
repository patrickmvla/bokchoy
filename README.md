# BokChoy

Wallet infrastructure for game economies. Audit-log-replayable credits and debits over a Postgres ledger you own.

```ts
import { BokChoy } from '@bokchoy/sdk-node';

const bokchoy = new BokChoy({ apiKey: process.env.BOKCHOY_API_KEY });

await bokchoy.wallets.credit({
  player: 'player_123',
  amount: 100,
  currency: 'gems',
  reason: 'level_up_reward',
});
```
