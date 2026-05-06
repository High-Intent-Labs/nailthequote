// /api/resend-webhook?secret=<token>
//
// Receives webhook events from Resend (delivered, opened, clicked, bounced,
// complained) and archives them in email_send_events. The admin panel joins
// this table to email_sequence_queue.resend_email_id to compute per-send
// open/click/bounce rates (see migration 010).
//
// Configure in the Resend dashboard:
//   1. Webhooks -> Add endpoint
//   2. URL: https://nailthequote.com/api/resend-webhook?secret=<RESEND_WEBHOOK_SECRET>
//   3. Events: email.delivered, email.opened, email.clicked, email.bounced,
//      email.complained, email.delivery_delayed
//
// Auth model (v1, intentionally simple): shared secret in the URL. Resend
// also offers Svix signature verification -- we should switch to that in a
// follow-up since the URL secret leaks via referer / log lines.

import type { Env } from '../_lib/env';
import { getSupabaseAdmin } from '../_lib/supabase';

interface ResendWebhookEvent {
  type: string;             // e.g. "email.opened"
  created_at?: string;
  data?: {
    email_id?: string;
    click?: {
      userAgent?: string;
      timestamp?: string;
      [k: string]: unknown;
    };
    created_at?: string;
    [k: string]: unknown;
  };
  [k: string]: unknown;
}

const BOT_UA_PATTERNS = [
  'amazon cloudfront',
  'cloudfront',
  'googlebot',
  'bingbot',
  'barracudacentral',
  'proofpoint',
  'mimecast',
  'fireeye',
  'messagelabs',
  'fortiguard',
  'ironport',
  'sophos',
  'symantec',
  'trendmicro',
  'mcafee',
  'spider',
  'prefetch',
  'link preview',
];

function isBotClick(data: ResendWebhookEvent['data']): boolean {
  if (!data?.click) return false;

  const ua = (data.click.userAgent ?? '').toLowerCase();

  if (BOT_UA_PATTERNS.some(p => ua.includes(p))) return true;

  if (!ua) return true;

  return false;
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
    console.log('resend-webhook: skipping payload missing type or email_id', body);
    return new Response(JSON.stringify({ ignored: true }), { status: 200 });
  }

  if (eventType === 'email.clicked' && isBotClick(body.data)) {
    const ua = body.data?.click?.userAgent ?? 'empty';
    const to = Array.isArray(body.data?.to) ? (body.data.to as string[])[0] : '?';
    console.log(`resend-webhook: bot click filtered | to=${to} | ua=${ua} | email=${emailId}`);
    return new Response(JSON.stringify({ ok: true, filtered: 'bot_click' }), { status: 200 });
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
    return new Response(JSON.stringify({ error: 'persist_failed' }), { status: 500 });
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200 });
};
