import type { Env } from '../_lib/env';
import { getSupabaseAdmin } from '../_lib/supabase';
import { getResend, getAudienceId } from '../_lib/resend';

// ---------------------------------------------------------------------------
// Basic in-memory duplicate-submission guard
// ---------------------------------------------------------------------------
// Cloudflare Workers are stateless across isolates, so this map only prevents
// rapid-fire duplicate requests hitting the SAME isolate (e.g. a user
// double-clicking submit). For proper rate limiting, configure Cloudflare WAF
// rate-limiting rules in the dashboard:
//   Zone > Security > WAF > Rate limiting rules
//   Suggested rule: /api/email-capture  — 5 requests per 10 seconds per IP.
// ---------------------------------------------------------------------------
const recentSubmissions = new Map<string, number>();
const DEDUP_WINDOW_MS = 10_000; // 10 seconds

function isDuplicate(email: string): boolean {
  const now = Date.now();
  const lastSeen = recentSubmissions.get(email);
  if (lastSeen && now - lastSeen < DEDUP_WINDOW_MS) {
    return true;
  }
  recentSubmissions.set(email, now);

  // Housekeeping: prune stale entries to avoid unbounded growth
  if (recentSubmissions.size > 500) {
    for (const [key, ts] of recentSubmissions) {
      if (now - ts > DEDUP_WINDOW_MS) {
        recentSubmissions.delete(key);
      }
    }
  }

  return false;
}

// --- Email capture endpoint: POST /api/email-capture ---
export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const body: any = await context.request.json();
    const { email, toolSlug, toolName, tradeSlug, tradeName, marketingConsent, sourceUrl, calculationResults } = body;

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Invalid email' }), { status: 400 });
    }

    // Duplicate-submission guard (same email within 10 s on this isolate)
    if (isDuplicate(email.toLowerCase())) {
      return new Response(JSON.stringify({ success: true, deduplicated: true }), { status: 200 });
    }

    const resend = getResend(context.env);
    const supabase = getSupabaseAdmin(context.env);

    // 1. Send results email with link back to tool
    const toolUrl = `https://nailthequote.com/${tradeSlug}/${toolSlug}`;
    const emailHtml = calculationResults
      ? buildResultsEmailWithData(toolName, tradeName, toolUrl, calculationResults)
      : buildResultsEmail(toolName, tradeName, toolUrl);
    await resend.emails.send({
      from: 'NailTheQuote Results <results@nailthequote.com>',
      to: email,
      subject: `Your ${toolName} Results — NailTheQuote.com`,
      html: emailHtml,
    });

    // 2. Add to Resend Audience (if marketing consent)
    if (marketingConsent) {
      const audienceId = getAudienceId(context.env);
      if (audienceId) {
        await resend.contacts.create({
          audienceId,
          email,
          unsubscribed: false,
          firstName: '',
          lastName: '',
          data: {
            source: 'nailthequote.com',
            trade: tradeSlug || '',
            tool: toolSlug || '',
            signup_type: 'email_capture',
            signup_date: new Date().toISOString().split('T')[0],
          },
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

function buildResultsEmailWithData(
  toolName: string,
  tradeName: string,
  toolUrl: string,
  results: {
    coolBtu?: number;
    heatBtu?: number;
    tonnage?: number;
    lowRange?: number;
    highRange?: number;
    sqft?: number;
    climateZone?: string;
    insulation?: string;
  },
): string {
  const fmt = (n?: number) => n ? n.toLocaleString('en-US') : '—';
  const row = (label: string, value: string) =>
    `<tr><td style="padding:8px 12px;color:#71717a;font-size:13px;border-bottom:1px solid #f4f4f5;">${label}</td><td style="padding:8px 12px;font-weight:600;color:#18181b;font-size:14px;text-align:right;border-bottom:1px solid #f4f4f5;">${value}</td></tr>`;

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <div style="max-width:560px;margin:0 auto;padding:40px 20px;">
    <div style="background:#ffffff;border-radius:12px;padding:32px;border:1px solid #e4e4e7;">
      <h1 style="font-size:20px;color:#18181b;margin:0 0 8px 0;">Your ${toolName} Results</h1>
      <p style="font-size:14px;color:#71717a;margin:0 0 24px 0;">${tradeName} &middot; NailTheQuote.com</p>

      <!-- Results table -->
      <table style="width:100%;border-collapse:collapse;margin:0 0 24px 0;background:#fafafa;border-radius:8px;overflow:hidden;">
        <tbody>
          ${row('Cooling Load', `${fmt(results.coolBtu)} BTU`)}
          ${row('Heating Load', `${fmt(results.heatBtu)} BTU`)}
          ${row('System Tonnage', `${results.tonnage ?? '—'} ton`)}
          ${row('Size Range', `${fmt(results.lowRange)} – ${fmt(results.highRange)} BTU`)}
        </tbody>
      </table>

      <!-- Inputs used -->
      <p style="font-size:12px;color:#a1a1aa;margin:0 0 8px 0;text-transform:uppercase;letter-spacing:0.05em;font-weight:600;">Inputs Used</p>
      <table style="width:100%;border-collapse:collapse;margin:0 0 24px 0;">
        <tbody>
          ${results.sqft ? row('Square Footage', `${fmt(results.sqft)} sq ft`) : ''}
          ${results.climateZone ? row('Climate Zone', results.climateZone) : ''}
          ${results.insulation ? row('Insulation', results.insulation) : ''}
        </tbody>
      </table>

      <p style="font-size:13px;color:#71717a;line-height:1.5;margin:0 0 24px 0;font-style:italic;">
        This is a simplified estimate. A full ACCA Manual J is required for permit applications and final equipment selection.
      </p>

      <a href="${toolUrl}" style="display:inline-block;background:#FF6B2B;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;padding:12px 24px;border-radius:8px;">
        Run Another Calculation &rarr;
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
