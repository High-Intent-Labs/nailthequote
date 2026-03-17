import type { Env } from '../../_lib/env';
import { getSupabaseAdmin } from '../../_lib/supabase';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const { businessName, trade, zipCode }: any = await context.request.json();

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

    // Upsert profile
    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      business_name: businessName || null,
      trade: trade || null,
      zip_code: zipCode || null,
      marketing_consent: user.user_metadata?.marketing_consent ?? true,
    }, { onConflict: 'id' });

    if (error) {
      console.error('Onboard error:', error);
      return new Response(JSON.stringify({ error: 'Failed to save profile' }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error('Onboard error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
};
