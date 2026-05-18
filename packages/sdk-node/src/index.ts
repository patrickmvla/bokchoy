/** @module @bokchoy/sdk-node — official Node/TypeScript SDK for BokChoy wallets. */

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
