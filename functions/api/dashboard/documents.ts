import type { Env } from '../../_lib/env';
import { getSupabaseAdmin } from '../../_lib/supabase';

export const onRequestGet: PagesFunction<Env> = async (context) => {
  try {
    const supabase = getSupabaseAdmin(context.env);
    const authHeader = context.request.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
    }

    const { data, error } = await supabase
      .from('saved_documents')
      .select('*')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      return new Response(JSON.stringify({ error: 'Failed to load' }), { status: 500 });
    }

    return new Response(JSON.stringify(data || []), { status: 200 });
  } catch {
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
};
