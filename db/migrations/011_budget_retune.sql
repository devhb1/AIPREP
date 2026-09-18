-- Phase 11: post-mock Appendix B cap retune (overrides 008's ≥$5 bump)

ALTER TABLE workspace_settings
  ALTER COLUMN max_daily_ai_spend_usd SET DEFAULT 1.0;

UPDATE workspace_settings
SET
  max_daily_ai_spend_usd = 1.0,
  settings = jsonb_set(
    coalesce(settings, '{}'::jsonb),
    '{maxDailyVoiceSpendUsd}',
    '0.4',
    true
  ),
  updated_at = now();
