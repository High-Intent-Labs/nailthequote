import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../../lib/supabase';
import { getResend, getAudienceId } from '../../../lib/resend';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const { email, marketingConsent, trigger } = await request.json();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return new Response(JSON.stringify({ error: 'Invalid email' }), { status: 400 });
    }

    const supabase = getSupabaseAdmin();

    // Send magic link via Supabase Auth
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: 'https://nailthequote.com/auth/callback',
        data: {
          marketing_consent: marketingConsent,
          signup_trigger: trigger,
        },
      },
    });

    if (error) {
      console.error('Magic link error:', error);
      return new Response(JSON.stringify({ error: 'Failed to send login link' }), { status: 500 });
    }

    // Add to Resend Audience if consented
    if (marketingConsent) {
      const resend = getResend();
      const audienceId = getAudienceId();
      if (audienceId) {
        await resend.contacts.create({
          audienceId,
          email,
          unsubscribed: false,
          firstName: '',
          lastName: '',
        }).catch(() => {}); // Non-blocking
      }
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error('Auth error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
};
