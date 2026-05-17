// @bokchoy/sdk-node — official Node.js / TypeScript SDK for BokChoy wallet
// infrastructure.
//
// Per [[marketing/v1-shape]] (iii) the public API uses friendly names
// (`player`, `currency: 'gems'`, `reason: 'level_up_reward'`); per
// [[wallet/credit-route-contract]] cascade #11 the client is a thin POSTer
// to the player-centric routes — no slug-resolver, no per-process cache —
// and named exception classes relay backend 404 response bodies for the
// caller to dispatch on.
//
// Cross-runtime: targets Node 20+, Bun, Cloudflare Workers, Deno, and modern
// browsers. The HTTP layer reaches for globalThis.fetch + globalThis.crypto
// — both standard across all listed runtimes — and the fetch implementation
// can be replaced via the constructor for testing or custom HTTP middleware.

import { type FetchLike, HttpClient } from './http';
import { WalletsApi } from './wallets';

const DEFAULT_BASE_URL = 'https://api.bokchoy.com';
const SDK_VERSION = '0.0.0';

export interface BokChoyConfig {
  /** Bearer API key — get one from the BokChoy cockpit. */
  apiKey: string;
  /** Override the default API base URL. Useful for staging environments or self-hosted backends. */
  baseUrl?: string;
  /** Replace the fetch implementation. Defaults to globalThis.fetch. */
  fetch?: FetchLike;
}

export class BokChoy {
  /** Wallet credit / debit operations. */
  readonly wallets: WalletsApi;

  constructor(config: BokChoyConfig) {
    if (!config.apiKey) {
      throw new Error('BokChoy: apiKey is required');
    }
    const fetchImpl: FetchLike = config.fetch ?? globalThis.fetch.bind(globalThis);
    const http = new HttpClient({
      baseUrl: config.baseUrl ?? DEFAULT_BASE_URL,
      apiKey: config.apiKey,
      userAgent: `bokchoy-sdk-node/${SDK_VERSION}`,
      fetchImpl,
    });
    this.wallets = new WalletsApi(http);
  }
}

export {
  BokchoyApiError,
  BokchoyAuthenticationError,
  BokchoyConnectionError,
  BokchoyError,
  BokchoyValidationError,
  UnknownCurrencyError,
  UnknownPlayerError,
} from './errors';
export type { FetchLike } from './http';
export type { WalletMutationParams, WalletMutationResult } from './wallets';
