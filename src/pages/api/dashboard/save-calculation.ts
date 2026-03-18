import type { APIRoute } from 'astro';
import { getSupabaseAdmin } from '../../../lib/supabase';

export const prerender = false;

export const POST: APIRoute = async ({ request }) => {
  try {
    const supabase = getSupabaseAdmin();
    const authHeader = request.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Not authenticated' }), { status: 401 });
    }

    const body = await request.json();

    // Ensure user has a profile row (FK constraint on user_id -> profiles.id)
    await supabase.from('profiles').upsert(
      { id: user.id, updated_at: new Date().toISOString() },
      { onConflict: 'id' }
    );

    const { error } = await supabase.from('saved_calculations').insert({
      user_id: user.id,
      tool_slug: body.toolSlug || body.tool_slug,
      trade: body.tradeSlug || body.trade || null,
      inputs: body.inputs || {},
      outputs: body.outputs || {},
      label: body.toolName || body.label || null,
    });

    if (error) {
      console.error('Save calc error:', error);
      return new Response(JSON.stringify({ error: 'Failed to save' }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error('Save calc error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
};
