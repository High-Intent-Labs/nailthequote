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

    // Documents are saved_calculations where the tool_slug indicates a template/document type
    const docSlugs = ['invoice-generator', 'estimate-template', 'work-order-template',
      'service-agreement-template', 'subcontractor-agreement-template',
      'inspection-report-template', 'completion-report-template', 'receipt-template',
      'maintenance-checklist', 'service-checklist', 'inspection-checklist',
      'punch-list-template', 'treatment-checklist', 'change-order-template'];

    const { data, error } = await supabase
      .from('saved_calculations')
      .select('id, tool_slug, trade, label, inputs, outputs, created_at')
      .eq('user_id', user.id)
      .in('tool_slug', docSlugs)
      .order('created_at', { ascending: false })
      .limit(20);

    // Map to document-like shape for the dashboard
    const docs = (data || []).map((calc: any) => ({
      id: calc.id,
      doc_type: calc.tool_slug.replace(/-/g, ' ').replace(/\b\w/g, (c: string) => c.toUpperCase()),
      client_name: calc.inputs?.['Customer Name'] || calc.inputs?.['customerName'] || calc.label,
      amount: calc.outputs?.['Total'] || calc.outputs?.['Subtotal'] || null,
      status: 'draft',
      trade: calc.trade,
      tool_slug: calc.tool_slug,
      created_at: calc.created_at,
    }));

    if (error) {
      return new Response(JSON.stringify({ error: 'Failed to load' }), { status: 500 });
    }

    return new Response(JSON.stringify(docs), { status: 200 });
  } catch {
    return new Response(JSON.stringify({ error: 'Internal error' }), { status: 500 });
  }
};
