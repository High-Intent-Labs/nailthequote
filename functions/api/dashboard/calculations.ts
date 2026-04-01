import type { Env } from '../../_lib/env';
import { getSupabaseAdmin } from '../../_lib/supabase';

// --- Admin endpoint: POST /api/dashboard/calculations with X-Admin-Key ---
const ADMIN_PASSWORD = 'nailthequoteangi26';

export const onRequestPost: PagesFunction<Env> = async (context) => {
  try {
    const authHeader = context.request.headers.get('X-Admin-Key');
    if (authHeader !== ADMIN_PASSWORD) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    }

    const supabase = getSupabaseAdmin(context.env);

    const [profilesRes, calcsRes, docsRes, emailsRes] = await Promise.all([
      supabase.from('profiles').select('*').order('created_at', { ascending: false }),
      supabase.from('saved_calculations').select('user_id, tool_slug, trade, label, created_at').order('created_at', { ascending: false }),
      supabase.from('saved_documents').select('user_id, doc_type, client_name, amount, status, created_at').order('created_at', { ascending: false }),
      supabase.from('email_captures').select('*').order('created_at', { ascending: false }),
    ]);

    if (profilesRes.error) return new Response(JSON.stringify({ error: 'profiles', detail: profilesRes.error.message }), { status: 500 });
    if (calcsRes.error) return new Response(JSON.stringify({ error: 'calculations', detail: calcsRes.error.message }), { status: 500 });
    if (docsRes.error) return new Response(JSON.stringify({ error: 'documents', detail: docsRes.error.message }), { status: 500 });
    if (emailsRes.error) return new Response(JSON.stringify({ error: 'emails', detail: emailsRes.error.message }), { status: 500 });

    const profiles = profilesRes.data || [];
    const calculations = calcsRes.data || [];
    const documents = docsRes.data || [];
    const emailCaptures = emailsRes.data || [];

    // Build activity per user
    const activityMap: Record<string, { tools: Record<string, number>; totalCalcs: number; documents: any[]; lastActive: string }> = {};

    for (const calc of calculations) {
      if (!activityMap[calc.user_id]) {
        activityMap[calc.user_id] = { tools: {}, totalCalcs: 0, documents: [], lastActive: calc.created_at };
      }
      const key = `${calc.trade}/${calc.tool_slug}`;
      activityMap[calc.user_id].tools[key] = (activityMap[calc.user_id].tools[key] || 0) + 1;
      activityMap[calc.user_id].totalCalcs++;
    }

    for (const doc of documents) {
      if (!activityMap[doc.user_id]) {
        activityMap[doc.user_id] = { tools: {}, totalCalcs: 0, documents: [], lastActive: doc.created_at };
      }
      activityMap[doc.user_id].documents.push({
        type: doc.doc_type, client: doc.client_name, amount: doc.amount,
        status: doc.status, created_at: doc.created_at,
      });
    }

    const users = profiles.map((profile: any) => {
      const activity = activityMap[profile.id] || { tools: {}, totalCalcs: 0, documents: [], lastActive: null };
      return {
        id: profile.id, email: profile.email, created_at: profile.created_at,
        business_name: profile.business_name || null, owner_name: profile.owner_name || null,
        trade: profile.trade || null, phone: profile.phone || null,
        address: profile.address || null, zip_code: profile.zip_code || null,
        license_number: profile.license_number || null,
        default_hourly_rate: profile.default_hourly_rate || null,
        default_markup: profile.default_markup || null, marketing_consent: profile.marketing_consent,
        tools_used: activity.tools, total_calculations: activity.totalCalcs,
        documents: activity.documents, last_active: activity.lastActive,
      };
    });

    return new Response(JSON.stringify({
      users,
      email_captures: emailCaptures,
      summary: {
        total_users: users.length, total_email_captures: emailCaptures.length,
        total_calculations: calculations.length, total_documents: documents.length,
      },
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e?.message || 'Internal error' }), { status: 500 });
  }
};

// --- Regular user endpoint: GET /api/dashboard/calculations ---
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

    // Exclude document-type tools (shown separately under Documents)
    const docSlugs = ['invoice-generator', 'estimate-template', 'work-order-template',
      'service-agreement-template', 'subcontractor-agreement-template',
      'inspection-report-template', 'completion-report-template', 'receipt-template',
      'maintenance-checklist', 'service-checklist', 'inspection-checklist',
      'punch-list-template', 'treatment-checklist', 'change-order-template'];

    const { data, error } = await supabase
      .from('saved_calculations')
      .select('*')
      .eq('user_id', user.id)
      .not('tool_slug', 'in', `(${docSlugs.join(',')})`)
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
