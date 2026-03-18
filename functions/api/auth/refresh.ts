import type { Env } from '../../_lib/env';
import { getSupabaseAdmin } from '../../_lib/supabase';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const supabase = getSupabaseAdmin(context.env);
    const body: any = await context.request.json();
    const { refresh_token } = body;

    if (!refresh_token) {
      return new Response(JSON.stringify({ error: 'Missing refresh token' }), { status: 400 });
    }

    const { data, error } = await supabase.auth.refreshSession({ refresh_token });

    if (error || !data.session) {
      return new Response(JSON.stringify({ error: 'Session expired — please log in again' }), { status: 401 });
    }

    return new Response(JSON.stringify({
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    }), { status: 200 });
  } catch {
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
};
