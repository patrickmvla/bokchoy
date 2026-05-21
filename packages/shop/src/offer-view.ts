/** Shared offer read shape + row parser for listOffers / getOffer. Per [[shop/shop-contract]] (132) reads. */

export interface OfferPrice {
  currencyCode: string;
  /** NUMERIC(20,4) kept as string (cast ::text in SQL) to preserve precision past 2^53. */
  amount: string;
}

export interface OfferItemRef {
  itemCode: string;
  quantity: number;
}

export interface OfferView {
  code: string;
  displayName: string;
  description: string | null;
  active: boolean;
  prices: OfferPrice[];
  items: OfferItemRef[];
}

/** SELECT alias contract shared by both read wrappers: code, display_name, description, active, prices(jsonb), items(jsonb). */
export function parseOfferRow(row: Record<string, unknown>): OfferView {
  const code = row.code;
  if (typeof code !== 'string') throw new Error(`unexpected code type: ${typeof code}`);

  const displayName = row.display_name;
  if (typeof displayName !== 'string')
    throw new Error(`unexpected display_name type: ${typeof displayName}`);

  const descriptionRaw = row.description;
  const description = descriptionRaw === null ? null : descriptionRaw;
  if (description !== null && typeof description !== 'string')
    throw new Error(`unexpected description type: ${typeof description}`);

  const active = row.active;
  if (typeof active !== 'boolean') throw new Error(`unexpected active type: ${typeof active}`);

  return {
    code,
    displayName,
    description,
    active,
    prices: parsePrices(row.prices),
    items: parseItems(row.items),
  };
}

function parsePrices(value: unknown): OfferPrice[] {
  const arr = asArray(value, 'prices');
  return arr.map((raw) => {
    const o = asObject(raw, 'price');
    const currencyCode = o.currencyCode;
    if (typeof currencyCode !== 'string')
      throw new Error(`unexpected currencyCode type: ${typeof currencyCode}`);
    const amount = o.amount;
    if (typeof amount !== 'string') throw new Error(`unexpected amount type: ${typeof amount}`);
    return { currencyCode, amount };
  });
}

function parseItems(value: unknown): OfferItemRef[] {
  const arr = asArray(value, 'items');
  return arr.map((raw) => {
    const o = asObject(raw, 'item');
    const itemCode = o.itemCode;
    if (typeof itemCode !== 'string')
      throw new Error(`unexpected itemCode type: ${typeof itemCode}`);
    const quantityRaw = o.quantity;
    let quantity: number;
    if (typeof quantityRaw === 'number') quantity = quantityRaw;
    else if (typeof quantityRaw === 'string') quantity = Number(quantityRaw);
    else throw new Error(`unexpected quantity type: ${typeof quantityRaw}`);
    return { itemCode, quantity };
  });
}

function asArray(value: unknown, label: string): unknown[] {
  const v = typeof value === 'string' ? (JSON.parse(value) as unknown) : value;
  if (!Array.isArray(v)) throw new Error(`unexpected ${label} type: ${typeof value}`);
  return v;
}

function asObject(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null)
    throw new Error(`unexpected ${label} type: ${typeof value}`);
  return value as Record<string, unknown>;
}
