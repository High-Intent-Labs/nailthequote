import type { Env } from '../../_lib/env';
import { getSupabaseAdmin } from '../../_lib/supabase';
import { getResend, getAudienceId } from '../../_lib/resend';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  // --- Webhook signature verification ---
  const webhookSecret = context.env.SUPABASE_WEBHOOK_SECRET;
  const incomingSecret = context.request.headers.get('x-webhook-secret');

  if (!webhookSecret || !incomingSecret || incomingSecret !== webhookSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
  }

  try {
    const body: any = await context.request.json();
    const { type, record } = body;

    // Only handle new signups
    if (type !== 'INSERT') {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    const email = record?.email;
    if (!email) {
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }

    const resend = getResend(context.env);
    const supabase = getSupabaseAdmin(context.env);

    // 1. Send welcome email
    await resend.emails.send({
      from: 'NailTheQuote <hello@nailthequote.com>',
      to: email,
      subject: 'Welcome to NailTheQuote — Your free pro tools are ready',
      html: buildWelcomeEmail(record.raw_user_meta_data?.trade),
    });

    // 2. Add to Resend Audience with account holder tag
    const audienceId = getAudienceId(context.env);
    if (audienceId) {
      await resend.contacts.create({
        audienceId,
        email,
        unsubscribed: false,
        firstName: record.raw_user_meta_data?.owner_name || '',
        lastName: '',
      }).catch(() => {});
    }

    // 3. Create profile record if it doesn't exist
    const trade = record.raw_user_meta_data?.trade;
    await supabase.from('profiles').upsert({
      id: record.id,
      trade: trade || null,
      marketing_consent: record.raw_user_meta_data?.marketing_consent ?? true,
    }, { onConflict: 'id' }).catch(() => {});

    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  } catch (err) {
    console.error('Webhook error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
};

function buildWelcomeEmail(trade?: string): string {
  const tradeLink = trade ? `/${trade}/` : '/#trades';
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 20px;">
    <div style="background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e4e4e7;">
      <h1 style="font-size:22px;color:#18181b;margin:0 0 8px 0;">Welcome to NailTheQuote</h1>
      <p style="font-size:14px;color:#71717a;margin:0 0 24px 0;">Your free account is ready.</p>

      <p style="font-size:14px;color:#3f3f46;line-height:1.6;margin:0 0 16px 0;">
        Here's what you can do now:
      </p>
      <ul style="font-size:14px;color:#3f3f46;line-height:1.8;padding-left:20px;margin:0 0 24px 0;">
        <li><strong>Save calculations</strong> — Access your results from any device</li>
        <li><strong>Create invoices &amp; estimates</strong> — Pre-filled with your business details</li>
        <li><strong>Download branded PDFs</strong> — Professional documents with your logo</li>
        <li><strong>Track your work</strong> — All your tools and documents in one dashboard</li>
      </ul>

      <a href="https://nailthequote.com${tradeLink}" style="display:inline-block;background:#FF6B2B;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;">
        Explore Your Tools &rarr;
      </a>

      <hr style="border:none;border-top:1px solid #e4e4e7;margin:32px 0 16px 0;">
      <p style="font-size:12px;color:#a1a1aa;margin:0;">
        Every tool is 100% free. No credit card. No trial. No catch.
      </p>
    </div>
    <p style="font-size:11px;color:#a1a1aa;text-align:center;margin:16px 0 0 0;">
      NailTheQuote.com &middot; Free tools for home service pros<br>
      <a href="{{{unsubscribe_url}}}" style="color:#a1a1aa;">Unsubscribe</a>
    </p>
  </div>
</body>
</html>`;
}
