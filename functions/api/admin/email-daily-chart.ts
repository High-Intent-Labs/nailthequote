import type { Env } from '../../_lib/env';
import { getSupabaseAdmin } from '../../_lib/supabase';

const ADMIN_PASSWORD = 'nailthequoteangi26';

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body: any = await context.request.json();
    if (body?.password !== ADMIN_PASSWORD) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const sb = getSupabaseAdmin(context.env);

    const [sendsRes, clickEventsRes, queueRes] = await Promise.all([
      sb
        .from('email_sequence_queue')
        .select('sent_at, persona')
        .eq('status', 'sent')
        .not('sent_at', 'is', null)
        .order('sent_at', { ascending: true }),
      sb
        .from('email_send_events')
        .select('resend_email_id, occurred_at')
        .eq('event_type', 'email.clicked')
        .order('occurred_at', { ascending: true }),
      sb
        .from('email_sequence_queue')
        .select('resend_email_id, persona')
        .eq('status', 'sent')
        .not('resend_email_id', 'is', null),
    ]);

    if (sendsRes.error) throw new Error(`sends: ${sendsRes.error.message}`);
    if (clickEventsRes.error) throw new Error(`clicks: ${clickEventsRes.error.message}`);
    if (queueRes.error) throw new Error(`queue: ${queueRes.error.message}`);

    const sendsByDay: Record<string, Record<string, number>> = {};
    for (const r of sendsRes.data) {
      const day = r.sent_at!.slice(0, 10);
      if (!sendsByDay[day]) sendsByDay[day] = {};
      sendsByDay[day][r.persona] = (sendsByDay[day][r.persona] || 0) + 1;
    }

    const resendToPersona: Record<string, string> = {};
    for (const r of queueRes.data) {
      if (r.resend_email_id) resendToPersona[r.resend_email_id] = r.persona;
    }

    const clicksByDay: Record<string, number> = {};
    const seenClickIds = new Set<string>();
    for (const r of clickEventsRes.data) {
      const day = r.occurred_at!.slice(0, 10);
      const key = `${day}:${r.resend_email_id}`;
      if (seenClickIds.has(key)) continue;
      seenClickIds.add(key);
      clicksByDay[day] = (clicksByDay[day] || 0) + 1;
    }

    return json({ sendsByDay, clicksByDay });
  } catch (err) {
    console.error('email-daily-chart error:', err);
    return json({ error: String(err) }, 500);
  }
};
