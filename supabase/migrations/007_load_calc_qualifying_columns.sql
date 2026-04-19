-- Migration 007: persist Load Calculator qualifying-question answers
--
-- Context: on 2026-04-19 the Load Calculator wizard gained two new
-- qualifying steps between the segment picker and the email gate:
--   Q2 "Is this a DIY project?"          → is_diy (boolean | null)
--   Q3 "Talked to an HVAC contractor?"   → contractor_stage
--                                          ('not_yet' | 'has_estimates'
--                                           | 'researching' | null)
-- See load-calculator-qualifying-questions.md §5 for the 5-bucket matrix
-- these two answers produce, and the motivation (installer_match_clicked
-- was 0% — we need to tag each email so the post-gate Angi handoff can
-- route to the right pitch).
--
-- Prior state: PostHog events (gate_shown, email_captured, diy_picked,
-- contractor_picked) already carry is_diy + contractor_stage, so the
-- admin analytics cards driven by HogQL (funnel + bucket performance)
-- already work without this migration. What's missing is persistence
-- into the Supabase email_captures table so the raw captures grid at
-- the bottom of the admin deep-dive (backed by get_load_calc_captures)
-- can show per-row DIY + Stage columns.
--
-- This migration:
--   1. Adds two columns to email_captures.
--   2. Replaces get_load_calc_captures so its jsonb_build_object returns
--      them. Also adds filters on both axes for future use — NULL means
--      "no constraint", matching the pattern used for segment_filter.
--
-- Both columns will be NULL for:
--   - Every non-Load-Calculator capture (these columns are Load-Calc-
--     specific; other tools don't ask these questions).
--   - Load Calculator captures from before 2026-04-19.
--   - Load Calculator pro-path captures (segment = 'customer' skips Q2/Q3).
--   - Load Calculator home-path captures where is_diy = true (skips Q3 →
--     contractor_stage stays NULL).
--
-- Safe to run once. ADD COLUMN IF NOT EXISTS + CREATE OR REPLACE make
-- it idempotent.

ALTER TABLE email_captures
  ADD COLUMN IF NOT EXISTS is_diy boolean,
  ADD COLUMN IF NOT EXISTS contractor_stage text;

-- Partial indexes — most captures will have NULLs here, so don't bloat
-- the index with them.
CREATE INDEX IF NOT EXISTS idx_email_captures_is_diy ON email_captures(is_diy)
  WHERE is_diy IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_email_captures_contractor_stage ON email_captures(contractor_stage)
  WHERE contractor_stage IS NOT NULL;

-- Extend the RPC so the admin captures grid can read both new columns.
-- Signature change: two new optional filter args (is_diy_filter,
-- contractor_stage_filter). NULL or omitted = no constraint on that axis.
-- The existing RPC is replaced, not dropped, so the old 4-arg signature
-- stops existing — the admin page will need to be deployed in the same
-- release (handled in src/pages/admin/tools/load-calculator.astro, but
-- for v1.1 we only pass the existing 4 args and let the new filter args
-- default to NULL).
CREATE OR REPLACE FUNCTION get_load_calc_captures(
  admin_password text,
  start_date timestamptz DEFAULT NULL,
  end_date timestamptz DEFAULT NULL,
  segment_filter text DEFAULT NULL,
  is_diy_filter boolean DEFAULT NULL,
  contractor_stage_filter text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF admin_password <> 'nailthequoteangi26' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id', id,
        'created_at', created_at,
        'email', email,
        'segment', segment,
        'is_diy', is_diy,
        'contractor_stage', contractor_stage,
        'ab_variant', ab_variant,
        'calculation_data', calculation_data,
        'marketing_consent', marketing_consent,
        'source_url', source_url
      )
      ORDER BY created_at DESC
    ),
    '[]'::jsonb
  )
  INTO result
  FROM email_captures
  WHERE tool_slug = 'load-calculator'
    AND (start_date IS NULL OR created_at >= start_date)
    AND (end_date   IS NULL OR created_at <= end_date)
    AND (segment_filter IS NULL OR segment_filter = 'all' OR segment = segment_filter)
    AND (is_diy_filter  IS NULL OR is_diy = is_diy_filter)
    AND (contractor_stage_filter IS NULL OR contractor_stage_filter = 'all'
         OR contractor_stage = contractor_stage_filter);

  RETURN result;
END;
$$;

GRANT EXECUTE ON FUNCTION get_load_calc_captures(text, timestamptz, timestamptz, text, boolean, text) TO anon;