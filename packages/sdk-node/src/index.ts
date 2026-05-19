/** @module @bokchoy/sdk-node — official Node/TypeScript SDK for BokChoy wallets. */

import pkg from '../package.json' with { type: 'json' };
import { type FetchLike, HttpClient } from './http';
import { InventoryApi } from './inventory';
import { WalletsApi } from './wallets';

const DEFAULT_BASE_URL = 'https://api.bokchoy.com';
const SDK_VERSION: string = pkg.version;

export interface BokChoyConfig {
  /** Bearer API key — get one from the BokChoy cockpit. */
  apiKey: string;
  /** Override the default API base URL. Useful for staging environments or self-hosted backends. */
  baseUrl?: string;
  /** Replace the fetch implementation. Defaults to globalThis.fetch. */
  fetch?: FetchLike;
}

export class BokChoy {
  /** Wallet credit / debit / balance / history operations. */
  readonly wallets: WalletsApi;
  /** Inventory grant / consume / list / get operations. */
  readonly inventory: InventoryApi;

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
    this.inventory = new InventoryApi(http);
  }
}

export {
  BokchoyApiError,
  BokchoyAuthenticationError,
  BokchoyConnectionError,
  BokchoyError,
  BokchoyValidationError,
  InsufficientInventoryError,
  InventoryOverflowError,
  UnknownCurrencyError,
  UnknownItemError,
  UnknownPlayerError,
} from './errors';
export type { FetchLike } from './http';
export type {
  InventoryConsumeParams,
  InventoryConsumeResult,
  InventoryGetParams,
  InventoryGetResult,
  InventoryGrantParams,
  InventoryGrantResult,
  InventoryInstance,
  InventoryListItem,
  InventoryListParams,
  InventoryListResult,
} from './inventory';
export type { WalletMutationParams, WalletMutationResult } from './wallets';
