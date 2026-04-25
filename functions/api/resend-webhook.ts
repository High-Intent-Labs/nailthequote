// /api/resend-webhook?secret=<token>
//
// Receives webhook events from Resend (delivered, opened, clicked, bounced,
// complained) and archives them in email_send_events. The admin panel joins
// this table to email_sequence_queue.resend_email_id to compute per-send
// open/click/bounce rates (see migration 010).
//
// Configure in the Resend dashboard:
//   1. Webhooks → Add endpoint
//   2. URL: https://nailthequote.com/api/resend-webhook?secret=<RESEND_WEBHOOK_SECRET>
//   3. Events: email.delivered, email.opened, email.clicked, email.bounced,
//      email.complained, email.delivery_delayed
//
// Auth model (v1, intentionally simple): shared secret in the URL. Resend
// also offers Svix signature verification — we should switch to that in a
// follow-up since the URL secret leaks via referer / log lines.

import type { Env } from '../_lib/env';
import { getSupabaseAdmin } from '../_lib/supabase';

interface ResendWebhookEvent {
  type: string;             // e.g. "email.opened"
  created_at?: string;
  data?: {
    email_id?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  const url = new URL(context.request.url);
  const providedSecret = url.searchParams.get('secret') ?? '';
  if (!context.env.RESEND_WEBHOOK_SECRET || providedSecret !== context.env.RESEND_WEBHOOK_SECRET) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }

  let body: ResendWebhookEvent;
  try {
    body = await context.request.json<ResendWebhookEvent>();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid json' }), { status: 400 });
  }

  const eventType = body?.type;
  const emailId = body?.data?.email_id;
  if (!eventType || !emailId) {
    // Resend may also send healthcheck POSTs. Don't 500 — just log and return 200.
    console.log('resend-webhook: skipping payload missing type or email_id', body);
    return new Response(JSON.stringify({ ignored: true }), { status: 200 });
  }

  const occurredAt = (typeof body.created_at === 'string' && !Number.isNaN(Date.parse(body.created_at)))
    ? new Date(body.created_at).toISOString()
    : new Date().toISOString();

  const supabase = getSupabaseAdmin(context.env);
  const { error } = await supabase.from('email_send_events').insert({
    resend_email_id: emailId,
    event_type: eventType,
    occurred_at: occurredAt,
    payload: body,
  });

  if (error) {
    console.error('resend-webhook: insert failed', {
      code: error.code,
      message: error.message,
      eventType,
      emailId,
    });
    // Return 500 so Resend retries — we want to capture all events.
    return new Response(JSON.stringify({ error: 'persist_failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
