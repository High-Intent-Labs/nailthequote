import type { APIRoute } from 'astro';
import { getResend, getAudienceId } from '../../lib/resend';
import { getSupabaseAdmin } from '../../lib/supabase';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const body = await request.json();
    const { email, toolSlug, toolName, tradeSlug, tradeName, marketingConsent, sourceUrl } = body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Invalid email' }), { status: 400 });
    }

    const resend = getResend();
    const supabase = getSupabaseAdmin();

    // 1. Send results email with link back to tool
    const toolUrl = `https://nailthequote.com/${tradeSlug}/${toolSlug}`;
    await resend.emails.send({
      from: 'NailTheQuote Results <results@nailthequote.com>',
      to: email,
      subject: `Your ${toolName} Results — NailTheQuote.com`,
      html: buildResultsEmail(toolName, tradeName, toolUrl),
    });

    // 2. Add to Resend Audience (if marketing consent)
    if (marketingConsent) {
      const audienceId = getAudienceId();
      if (audienceId) {
        await resend.contacts.create({
          audienceId,
          email,
          unsubscribed: false,
          firstName: '',
          lastName: '',
        });
      }
    }

    // 3. Log to Supabase email_captures table
    await supabase.from('email_captures').insert({
      email,
      trade: tradeSlug,
      tool_slug: toolSlug,
      source_url: sourceUrl || `/${tradeSlug}/${toolSlug}`,
      marketing_consent: marketingConsent ?? false,
    });

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error('Email capture error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
};

function buildResultsEmail(toolName: string, tradeName: string, toolUrl: string): string {
  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 20px;">
    <div style="background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e4e4e7;">
      <h1 style="font-size:20px;color:#18181b;margin:0 0 8px 0;">Your ${toolName} Results</h1>
      <p style="font-size:14px;color:#71717a;margin:0 0 24px 0;">${tradeName} &middot; NailTheQuote.com</p>
      <p style="font-size:14px;color:#3f3f46;line-height:1.6;margin:0 0 24px 0;">
        Your calculation results are ready. Click the link below to view them. Bookmark the page to access your results anytime.
      </p>
      <a href="${toolUrl}" style="display:inline-block;background:#FF6B2B;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;">
        View Your Results &rarr;
      </a>
      <hr style="border:none;border-top:1px solid #e4e4e7;margin:32px 0 16px 0;">
      <p style="font-size:12px;color:#a1a1aa;margin:0;">
        Create a <a href="https://nailthequote.com/dashboard" style="color:#FF6B2B;text-decoration:none;">free account</a> to save your calculations and pre-fill your business details.
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
