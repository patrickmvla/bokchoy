-- Bootstrap default-set of system reason codes on project creation.
--
-- Per [[wallet-mechanics]] Amendment Part 3 A17 + [[economy-primitives-research]] F6:
-- 8 faucets + 4 drains, all with is_system=TRUE. Customer extensions get
-- is_system=FALSE via a future customer-facing CRUD endpoint (Month 4+ cockpit
-- deliverable).
--
-- Mechanism choice (Slice 5): Postgres function called explicitly by app code.
-- Three options were considered (function vs trigger vs app-side TS hook).
-- Function won on:
--   • Single source of truth for the fixed 12-code list (data lives in SQL
--     where the schema is).
--   • Visible call site (no hidden trigger magic — debugging a missing code
--     surfaces "did the caller forget to call?" not "why didn't the trigger fire?").
--   • Reusable across all project-creation paths (cockpit, CLI, admin tooling,
--     tests, migration seeds) without scattering INSERT logic.
--   • Idempotent via INSERT … ON CONFLICT DO NOTHING — partial-bootstrap
--     recovery is a no-op re-call.
--
-- The SDK reason-code enum (Slice 8 deliverable) will mirror this list in TS
-- for customer-facing autocomplete; small duplicate-strings cost, changes are
-- migrations anyway.

CREATE OR REPLACE FUNCTION bootstrap_project_reason_codes(p_project_id uuid)
RETURNS integer  -- count of codes inserted (0 if all already present)
LANGUAGE plpgsql
AS $$
DECLARE
  v_inserted integer := 0;
BEGIN
  INSERT INTO reason_codes (project_id, code, display_name, category, is_system) VALUES
    -- Faucets (currency entering player wallets).
    (p_project_id, 'signup_bonus',         'Signup Bonus',          'faucet', true),
    (p_project_id, 'daily_login',          'Daily Login Bonus',     'faucet', true),
    (p_project_id, 'quest_reward',         'Quest Reward',          'faucet', true),
    (p_project_id, 'loot_pull_reward',     'Loot Pull Reward',      'faucet', true),
    (p_project_id, 'shop_purchase_grant',  'Shop Purchase Grant',   'faucet', true),
    (p_project_id, 'iap_grant',            'IAP Grant',             'faucet', true),
    (p_project_id, 'compensation',         'Compensation',          'faucet', true),
    (p_project_id, 'admin_grant',          'Admin Grant',           'faucet', true),
    -- Drains (currency leaving player wallets).
    (p_project_id, 'loot_pull_cost',       'Loot Pull Cost',        'drain',  true),
    (p_project_id, 'shop_purchase_cost',   'Shop Purchase Cost',    'drain',  true),
    (p_project_id, 'crafting_cost',        'Crafting Cost',         'drain',  true),
    (p_project_id, 'admin_debit',          'Admin Debit',           'drain',  true)
  ON CONFLICT (project_id, code) DO NOTHING;

  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END;
$$;--> statement-breakpoint

REVOKE ALL ON FUNCTION bootstrap_project_reason_codes(uuid) FROM PUBLIC;--> statement-breakpoint
GRANT EXECUTE ON FUNCTION bootstrap_project_reason_codes(uuid) TO bokchoy_app;
