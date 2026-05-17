-- Slice M-1.5 per [[wallet/credit-route-contract]].
--
-- Two pieces in one migration (the same atomic decision — adding the schema
-- field that lazy-create needs and the SQL functions that use it):
--
--   1. players.external_id column + URL-safe CHECK + partial UNIQUE INDEX
--      per [[wallet/credit-route-contract]] (ii). Nullable: existing players
--      minted via Better Auth have no customer-facing identifier; new players
--      minted via SDK lazy-create (per (iii)) have external_id set + email
--      NULL. URL-path-safe regex (RFC 3986 unreserved minus '~') prevents
--      path-traversal / null-byte / URL-special-char inputs at the DB layer.
--      128-char ceiling matches Better Auth's organization-slug limit.
--      Unique-where-non-null preserves multi-NULL legacy rows.
--
--   2. wallet_credit_by_external_id + wallet_debit_by_external_id stored
--      functions per [[wallet/credit-route-contract]] (iii). Lazy-create
--      player + wallet via INSERT...ON CONFLICT DO NOTHING, then call the
--      existing wallet_credit / wallet_debit logic with the resolved
--      walletId. Returns TABLE(transaction_id, wallet_id, player_id,
--      balance_after) — the handler response needs all four; the existing
--      wallet_credit returns just the txn_id and would force a second
--      query, defeating the single-round-trip rationale.
--
-- Currency code → id is resolved inside the function so the lazy-create +
-- credit path is one atomic transaction. UnknownCurrency raises BC060
-- (SQLSTATE allocated per [[wallet-mechanics]] Part 3 A18); the TS handler
-- catches BC060 and forms the 404 + availableCodes response per
-- [[wallet/credit-route-contract]] (i).
--
-- The two ON CONFLICT DO NOTHING clauses prevent the lost-update class of
-- races on first-credit-from-same-player: the second concurrent caller sees
-- the row already exists and proceeds to credit without error. wallet_credit
-- itself takes FOR UPDATE on the wallet row per Part 1 A2, serializing the
-- credit phase.
--
-- Schema comment at packages/db/src/schema/wallet.ts:92 (claiming lazy-create
-- lives inside wallet_credit) was DELETED in the same slice — that location
-- is now wrong; lazy-create lives in these two new functions.

-- ---------- players.external_id ----------

ALTER TABLE "players" ADD COLUMN "external_id" text;--> statement-breakpoint
CREATE UNIQUE INDEX "players_project_id_external_id_unique" ON "players" USING btree ("project_id","external_id") WHERE "players"."external_id" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "players" ADD CONSTRAINT "players_external_id_check" CHECK ("players"."external_id" IS NULL OR "players"."external_id" ~ '^[A-Za-z0-9._-]{1,128}$');--> statement-breakpoint

-- ---------- wallet_credit_by_external_id ----------

CREATE OR REPLACE FUNCTION wallet_credit_by_external_id(
  p_project_id          uuid,
  p_player_external_id  text,
  p_currency_code       text,
  p_amount              numeric,
  p_reason_code         text,
  p_source_event_id     text     DEFAULT NULL,
  p_idempotency_key_id  bigint   DEFAULT NULL,
  p_related_id          bigint   DEFAULT NULL,
  p_related_type        text     DEFAULT NULL,
  p_metadata            jsonb    DEFAULT '{}'::jsonb
) RETURNS TABLE (
  transaction_id  bigint,
  wallet_id       uuid,
  player_id       uuid,
  balance_after   numeric
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant       uuid;
  v_currency_id  uuid;
  v_player_id    uuid;
  v_wallet_id    uuid;
  v_txn_id       bigint;
  v_balance      numeric(20,4);
BEGIN
  -- (1) Tenant context check (defense-in-depth on top of RLS; same as
  -- wallet_credit). Surfaces missing-GUC bugs immediately.
  v_tenant := current_setting('app.current_tenant')::uuid;
  IF v_tenant IS DISTINCT FROM p_project_id THEN
    RAISE EXCEPTION 'TenantMismatch: GUC=% p_project_id=%', v_tenant, p_project_id
      USING ERRCODE = 'BC020';
  END IF;

  -- (2) Resolve currency code → id in a single project-scoped lookup.
  -- BC060 is the reserved allocation for CurrencyNotFound per Part 3 A18.
  -- The handler catches BC060 and forms 404 + availableCodes; SQL stays out
  -- of HTTP-response composition.
  SELECT id INTO v_currency_id
  FROM currencies
  WHERE project_id = p_project_id AND code = p_currency_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CurrencyNotFound: code=% project_id=%', p_currency_code, p_project_id
      USING ERRCODE = 'BC060';
  END IF;

  -- (3) Lazy-create player. ON CONFLICT DO NOTHING is race-safe: a second
  -- concurrent caller with the same (project_id, external_id) sees the row
  -- already exists and falls through to the SELECT. RETURNING is empty when
  -- the conflict path fires, so we SELECT to fetch the existing player_id.
  INSERT INTO players (project_id, external_id)
  VALUES (p_project_id, p_player_external_id)
  ON CONFLICT (project_id, external_id) WHERE external_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_player_id;

  IF v_player_id IS NULL THEN
    SELECT id INTO v_player_id
    FROM players
    WHERE project_id = p_project_id AND external_id = p_player_external_id;
  END IF;

  -- (4) Lazy-create wallet. Same race-safety pattern as players.
  INSERT INTO wallets (project_id, player_id, currency_id)
  VALUES (p_project_id, v_player_id, v_currency_id)
  ON CONFLICT (project_id, player_id, currency_id) DO NOTHING
  RETURNING id INTO v_wallet_id;

  IF v_wallet_id IS NULL THEN
    SELECT id INTO v_wallet_id
    FROM wallets
    WHERE project_id = p_project_id
      AND player_id  = v_player_id
      AND currency_id = v_currency_id;
  END IF;

  -- (5) Delegate to existing wallet_credit. Holds FOR UPDATE lock on the
  -- wallet row per Part 1 A2; handles idempotency-replay; raises BC010/021/022
  -- on its own error classes. Returns the txn id.
  SELECT wallet_credit(
    p_project_id,
    v_wallet_id,
    p_amount,
    v_currency_id,
    p_reason_code,
    p_source_event_id,
    p_idempotency_key_id,
    p_related_id,
    p_related_type,
    p_metadata
  ) INTO v_txn_id;

  -- (6) Read wallet.balance post-credit. wallet_credit updated the row
  -- inside the same transaction, so this SELECT sees the new balance.
  SELECT balance INTO v_balance
  FROM wallets
  WHERE id = v_wallet_id;

  RETURN QUERY SELECT v_txn_id, v_wallet_id, v_player_id, v_balance;
END;
$$;--> statement-breakpoint

-- ---------- wallet_debit_by_external_id ----------
--
-- Sister function: identical lazy-create-then-delegate shape, calling
-- wallet_debit instead of wallet_credit. wallet_debit raises BC010
-- (InsufficientFunds) when the post-debit balance would breach the wallet's
-- allow_negative_balance flag — that error propagates through this wrapper
-- unchanged.

CREATE OR REPLACE FUNCTION wallet_debit_by_external_id(
  p_project_id          uuid,
  p_player_external_id  text,
  p_currency_code       text,
  p_amount              numeric,
  p_reason_code         text,
  p_source_event_id     text     DEFAULT NULL,
  p_idempotency_key_id  bigint   DEFAULT NULL,
  p_related_id          bigint   DEFAULT NULL,
  p_related_type        text     DEFAULT NULL,
  p_metadata            jsonb    DEFAULT '{}'::jsonb
) RETURNS TABLE (
  transaction_id  bigint,
  wallet_id       uuid,
  player_id       uuid,
  balance_after   numeric
)
LANGUAGE plpgsql
AS $$
DECLARE
  v_tenant       uuid;
  v_currency_id  uuid;
  v_player_id    uuid;
  v_wallet_id    uuid;
  v_txn_id       bigint;
  v_balance      numeric(20,4);
BEGIN
  v_tenant := current_setting('app.current_tenant')::uuid;
  IF v_tenant IS DISTINCT FROM p_project_id THEN
    RAISE EXCEPTION 'TenantMismatch: GUC=% p_project_id=%', v_tenant, p_project_id
      USING ERRCODE = 'BC020';
  END IF;

  SELECT id INTO v_currency_id
  FROM currencies
  WHERE project_id = p_project_id AND code = p_currency_code;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'CurrencyNotFound: code=% project_id=%', p_currency_code, p_project_id
      USING ERRCODE = 'BC060';
  END IF;

  INSERT INTO players (project_id, external_id)
  VALUES (p_project_id, p_player_external_id)
  ON CONFLICT (project_id, external_id) WHERE external_id IS NOT NULL DO NOTHING
  RETURNING id INTO v_player_id;

  IF v_player_id IS NULL THEN
    SELECT id INTO v_player_id
    FROM players
    WHERE project_id = p_project_id AND external_id = p_player_external_id;
  END IF;

  INSERT INTO wallets (project_id, player_id, currency_id)
  VALUES (p_project_id, v_player_id, v_currency_id)
  ON CONFLICT (project_id, player_id, currency_id) DO NOTHING
  RETURNING id INTO v_wallet_id;

  IF v_wallet_id IS NULL THEN
    SELECT id INTO v_wallet_id
    FROM wallets
    WHERE project_id = p_project_id
      AND player_id  = v_player_id
      AND currency_id = v_currency_id;
  END IF;

  SELECT wallet_debit(
    p_project_id,
    v_wallet_id,
    p_amount,
    v_currency_id,
    p_reason_code,
    p_source_event_id,
    p_idempotency_key_id,
    p_related_id,
    p_related_type,
    p_metadata
  ) INTO v_txn_id;

  SELECT balance INTO v_balance
  FROM wallets
  WHERE id = v_wallet_id;

  RETURN QUERY SELECT v_txn_id, v_wallet_id, v_player_id, v_balance;
END;
$$;--> statement-breakpoint

-- ---------- GRANTs ----------
-- Under M1 (Part 1 A1), REVOKE FROM PUBLIC + GRANT EXECUTE TO bokchoy_app is
-- tidiness, not a load-bearing privilege barrier. Discipline that mutations
-- go through these functions is in scripts/check-direct-wallet-mutation.ts.

REVOKE ALL ON FUNCTION wallet_credit_by_external_id(uuid, text, text, numeric, text, text, bigint, bigint, text, jsonb) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION wallet_credit_by_external_id(uuid, text, text, numeric, text, text, bigint, bigint, text, jsonb) TO bokchoy_app;--> statement-breakpoint

REVOKE ALL ON FUNCTION wallet_debit_by_external_id(uuid, text, text, numeric, text, text, bigint, bigint, text, jsonb) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION wallet_debit_by_external_id(uuid, text, text, numeric, text, text, bigint, bigint, text, jsonb) TO bokchoy_app;
