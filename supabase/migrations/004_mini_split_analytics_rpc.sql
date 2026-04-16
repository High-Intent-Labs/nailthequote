-- Migration 004: RPC backing the admin mini-split deep-dive.
--
-- Returns email-capture rows for the mini-split tool, with optional date
-- and segment filters. SECURITY DEFINER so it bypasses RLS; the admin
-- password is the security boundary, same pattern as get_admin_data.
--
-- Call from the browser via Supabase REST:
--   POST /rest/v1/rpc/get_mini_split_captures
--   body: { admin_password, start_date, end_date, segment_filter }
--
-- Any null filter means "no constraint on this axis":
--   start_date = NULL  → no lower bound (all-time so far)
--   end_date   = NULL  → no upper bound
--   segment_filter = NULL or 'all' → both segments + rows where segment is NULL

CREATE OR REPLACE FUNCTION get_mini_split_captures(
  admin_password text,
  start_date timestamptz DEFAULT NULL,
  end_date timestamptz DEFAULT NULL,
  segment_filter text DEFAULT NULL
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
  WHERE tool_slug = 'mini-split-sizing-calculator'
    AND (start_date IS NULL OR created_at >= start_date)
    AND (end_date   IS NULL OR created_at <= end_date)
    AND (segment_filter IS NULL OR segment_filter = 'all' OR segment = segment_filter);

  RETURN result;
END;
$$;

-- Browser calls this via the anon key; the SECURITY DEFINER block + the
-- password check inside are what protect the data.
GRANT EXECUTE ON FUNCTION get_mini_split_captures(text, timestamptz, timestamptz, text) TO anon;
