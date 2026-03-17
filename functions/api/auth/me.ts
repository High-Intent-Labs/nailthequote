import type { Env } from '../../_lib/env';
import { getSupabaseAdmin } from '../../_lib/supabase';

async function handleMe(request: Request, env: Env) {
  try {
    const supabase = getSupabaseAdmin(env);
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error } = await supabase.auth.getUser(token);

    if (error || !user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
    }

    // Check if profile exists
    const { data: profile } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single();

    return new Response(JSON.stringify({
      user: {
        id: user.id,
        email: user.email,
        createdAt: user.created_at,
      },
      profile: profile || null,
      needsOnboarding: !profile,
    }), { status: 200 });
  } catch (err) {
    console.error('Me error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
}

export const onRequestPost: PagesFunction<Env> = async (context) => {
  return handleMe(context.request, context.env);
};

export const onRequestGet: PagesFunction<Env> = async (context) => {
  return handleMe(context.request, context.env);
};
