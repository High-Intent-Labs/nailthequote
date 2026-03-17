import type { Env } from '../../_lib/env';
import { getSupabaseAdmin } from '../../_lib/supabase';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { redirectTo }: any = await context.request.json();
    const supabase = getSupabaseAdmin(context.env);

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
