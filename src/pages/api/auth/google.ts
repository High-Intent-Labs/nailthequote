import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../../lib/supabase';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const { redirectTo } = await request.json();

    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: redirectTo || 'https://nailthequote.com/auth/callback',
      },
    });

    if (error || !data?.url) {
      return new Response(JSON.stringify({ error: 'Failed to initiate Google sign-in' }), { status: 500 });
    }

    return new Response(JSON.stringify({ url: data.url }), { status: 200 });
  } catch (err) {
    console.error('Google auth error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
};
