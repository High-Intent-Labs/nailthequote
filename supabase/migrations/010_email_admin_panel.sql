-- Migration 010: Tier C admin tooling for the persona-1 nurture sequence
--
-- Adds:
--   1. system_settings table — single source of truth for runtime toggles.
--      Tier C uses this for the email-scheduler kill switch.
--   2. email_send_events table — archive of Resend webhook events
--      (delivered, opened, clicked, bounced, complained). Joins to
--      email_sequence_queue.resend_email_id to surface per-email engagement.
--   3. get_email_sequence_admin(admin_password) — JSONB rollup of queue
--      health + per-email engagement + recent failures + kill-switch state.
--   4. set_email_scheduler_paused(admin_password, paused) — admin toggle.
--
-- Apply order: run BEFORE deploying Tier C code. Per the 2026-04-19 incident
-- pattern, schema-first or the worker silently drops INSERTs.
--
-- Apply via Supabase SQL Editor against project toovnncuvzqzurugmiib.

-- ---------------------------------------------------------------------------
-- 1. system_settings — runtime toggles
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS system_settings (
  key         TEXT PRIMARY KEY,
  value       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_by  TEXT
);

-- Default: scheduler enabled. Admin UI flips this via set_email_scheduler_paused.
INSERT INTO system_settings (key, value)
VALUES ('email_scheduler_paused', 'false'::jsonb)
ON CONFLICT (key) DO NOTHING;

ALTER TABLE system_settings ENABLE ROW LEVEL SECURITY;
-- No anon policy = anon can't read directly. Reads go through the RPC below
-- (admin-password gated) or via service_role from the Cloudflare Worker.

-- ---------------------------------------------------------------------------
-- 2. email_send_events — Resend webhook archive
-- ---------------------------------------------------------------------------
-- Resend's webhook fires events like email.delivered / email.opened /
-- email.clicked / email.bounced / email.complained. We persist the payload
-- so we can compute open + click rates per persona/email_number, surface
-- bounces in the admin, and have an audit trail.

CREATE TABLE IF NOT EXISTS email_send_events (
  id              BIGSERIAL PRIMARY KEY,
  resend_email_id TEXT NOT NULL,
  event_type      TEXT NOT NULL,
  occurred_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  payload         JSONB,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS email_send_events_resend_id
  ON email_send_events (resend_email_id);
CREATE INDEX IF NOT EXISTS email_send_events_type_time
  ON email_send_events (event_type, occurred_at DESC);

ALTER TABLE email_send_events ENABLE ROW LEVEL SECURITY;
-- Same as system_settings — no anon policy. Writes from the webhook
-- (service-role); reads from the admin RPC.

-- ---------------------------------------------------------------------------
-- 3. get_email_sequence_admin(admin_password)
-- ---------------------------------------------------------------------------
-- Returns a JSONB rollup with everything the admin "Email sequence" panel
-- needs in one round-trip:
--   - queueByStatus: counts of each status across the whole queue
--   - queueByPersonaDay: per (persona, email_number) sent/failed/pending/unsub
--     counts AND open/click/bounce counts derived from email_send_events
--   - recentFailures: last 20 failed rows with error messages
--   - recentSends: last 50 sent rows
--   - unsubscribeCount: total rows in email_unsubscribes
--   - schedulerPaused: kill switch state
--   - lastTickHints: oldest pending and newest sent timestamps to spot lag

CREATE OR REPLACE FUNCTION get_email_sequence_admin(admin_password TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  result JSONB;
BEGIN
  IF admin_password IS NULL OR admin_password != 'nailthequoteangi26' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  WITH engagement AS (
    -- For each (persona, email_number), join queue.resend_email_id to send events
    -- and pivot into open/click/bounce/complaint counts.
    SELECT
      q.persona,
      q.email_number,
      COUNT(DISTINCT q.resend_email_id) FILTER (
        WHERE EXISTS (SELECT 1 FROM email_send_events e
                      WHERE e.resend_email_id = q.resend_email_id
                        AND e.event_type IN ('email.delivered'))
      ) AS delivered,
      COUNT(DISTINCT q.resend_email_id) FILTER (
        WHERE EXISTS (SELECT 1 FROM email_send_events e
                      WHERE e.resend_email_id = q.resend_email_id
                        AND e.event_type IN ('email.opened'))
      ) AS opened,
      COUNT(DISTINCT q.resend_email_id) FILTER (
        WHERE EXISTS (SELECT 1 FROM email_send_events e
                      WHERE e.resend_email_id = q.resend_email_id
                        AND e.event_type IN ('email.clicked'))
      ) AS clicked,
      COUNT(DISTINCT q.resend_email_id) FILTER (
        WHERE EXISTS (SELECT 1 FROM email_send_events e
                      WHERE e.resend_email_id = q.resend_email_id
                        AND e.event_type IN ('email.bounced', 'email.complained'))
      ) AS bounced
    FROM email_sequence_queue q
    WHERE q.resend_email_id IS NOT NULL
      AND q.status = 'sent'
    GROUP BY q.persona, q.email_number
  )
  SELECT jsonb_build_object(
    'queueByStatus', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('status', status, 'count', cnt) ORDER BY status)
      FROM (SELECT status, COUNT(*) AS cnt FROM email_sequence_queue GROUP BY status) s
    ), '[]'::jsonb),
    'queueByPersonaDay', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'persona', q.persona,
          'email_number', q.email_number,
          'pending', q.pending,
          'sent', q.sent,
          'failed', q.failed,
          'unsubscribed', q.unsubscribed,
          'cancelled', q.cancelled,
          'delivered', COALESCE(e.delivered, 0),
          'opened', COALESCE(e.opened, 0),
          'clicked', COALESCE(e.clicked, 0),
          'bounced', COALESCE(e.bounced, 0)
        ) ORDER BY q.persona, q.email_number
      )
      FROM (
        SELECT
          persona,
          email_number,
          COUNT(*) FILTER (WHERE status = 'pending') AS pending,
          COUNT(*) FILTER (WHERE status = 'sent') AS sent,
          COUNT(*) FILTER (WHERE status = 'failed') AS failed,
          COUNT(*) FILTER (WHERE status = 'unsubscribed') AS unsubscribed,
          COUNT(*) FILTER (WHERE status = 'cancelled') AS cancelled
        FROM email_sequence_queue
        GROUP BY persona, email_number
      ) q
      LEFT JOIN engagement e USING (persona, email_number)
    ), '[]'::jsonb),
    'recentFailures', COALESCE((
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT id, email, persona, email_number, scheduled_at, claimed_at, error_message
        FROM email_sequence_queue
        WHERE status = 'failed'
        ORDER BY claimed_at DESC NULLS LAST, id DESC
        LIMIT 20
      ) t
    ), '[]'::jsonb),
    'recentSends', COALESCE((
      SELECT jsonb_agg(row_to_json(t))
      FROM (
        SELECT id, email, persona, email_number, sent_at, resend_email_id
        FROM email_sequence_queue
        WHERE status = 'sent'
        ORDER BY sent_at DESC NULLS LAST, id DESC
        LIMIT 50
      ) t
    ), '[]'::jsonb),
    'unsubscribeCount', (SELECT COUNT(*) FROM email_unsubscribes),
    'schedulerPaused', COALESCE((
      SELECT (value::text)::boolean FROM system_settings WHERE key = 'email_scheduler_paused'
    ), false),
    'oldestPendingDue', (
      SELECT MIN(scheduled_at) FROM email_sequence_queue
      WHERE status = 'pending' AND scheduled_at <= NOW()
    ),
    'newestSent', (
      SELECT MAX(sent_at) FROM email_sequence_queue WHERE status = 'sent'
    )
  ) INTO result;

  RETURN COALESCE(result, '{}'::jsonb);
END;
$$;

REVOKE ALL ON FUNCTION get_email_sequence_admin(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION get_email_sequence_admin(TEXT) TO anon;

-- ---------------------------------------------------------------------------
-- 4. set_email_scheduler_paused(admin_password, paused)
-- ---------------------------------------------------------------------------
-- Admin-only kill switch toggle. Returns the new paused state.

CREATE OR REPLACE FUNCTION set_email_scheduler_paused(admin_password TEXT, paused BOOLEAN)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
BEGIN
  IF admin_password IS NULL OR admin_password != 'nailthequoteangi26' THEN
    RAISE EXCEPTION 'Unauthorized';
  END IF;

  INSERT INTO system_settings (key, value, updated_at, updated_by)
  VALUES ('email_scheduler_paused', to_jsonb(paused), NOW(), 'admin_ui')
  ON CONFLICT (key) DO UPDATE
    SET value = to_jsonb(paused),
        updated_at = NOW(),
        updated_by = 'admin_ui';

  RETURN paused;
END;
$$;

REVOKE ALL ON FUNCTION set_email_scheduler_paused(TEXT, BOOLEAN) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION set_email_scheduler_paused(TEXT, BOOLEAN) TO anon;

-- Done.
