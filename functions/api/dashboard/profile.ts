import type { Env } from '../../_lib/env';
import { getSupabaseAdmin } from '../../_lib/supabase';

export const onRequestPost: PagesFunction<Env> = async (context) => {
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

    const body: any = await context.request.json();

    const { error } = await supabase.from('profiles').upsert({
      id: user.id,
      business_name: body.businessName || null,
      owner_name: body.ownerName || null,
      trade: body.trade || null,
      phone: body.phone || null,
      email: body.email || null,
      license_number: body.licenseNumber || null,
      default_hourly_rate: body.defaultHourlyRate ? parseFloat(body.defaultHourlyRate) : null,
      default_markup: body.defaultMarkup ? parseFloat(body.defaultMarkup) : null,
    }, { onConflict: 'id' });

    if (error) {
      console.error('Profile save error:', error);
      return new Response(JSON.stringify({ error: 'Failed to save' }), { status: 500 });
    }

    return new Response(JSON.stringify({ success: true }), { status: 200 });
  } catch (err) {
    console.error('Profile error:', err);
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
};
