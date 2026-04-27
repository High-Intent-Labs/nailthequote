// Persona-5 (pro / contractor) enrollment helpers.

import type { SupabaseClient } from '@supabase/supabase-js';
import { PERSONA5_MANIFEST } from '../_generated/email-templates';
import type { CaptureContext } from './persona1-enroll';

export const PERSONA5_KEY = 'pro';

// 30 min, 5 days, 14 days.
const PERSONA5_OFFSET_MINUTES: number[] = [30, 5 * 24 * 60, 14 * 24 * 60];

export function qualifiesForPersona5(c: CaptureContext): boolean {
  return c.toolSlug === 'load-calculator' && c.segment === 'customer';
}

export async function enrollPersona5(
  supabase: SupabaseClient,
  c: CaptureContext
): Promise<{ enrolled: boolean; reason?: string; rowCount?: number }> {
  if (!qualifiesForPersona5(c)) return { enrolled: false, reason: 'not-qualified' };

  const { data: suppressRow, error: suppressErr } = await supabase
    .from('email_unsubscribes')
    .select('email')
    .eq('email', c.email)
    .limit(1);
  if (suppressErr) {
    console.error('persona5-enroll: suppression lookup failed', suppressErr);
    return { enrolled: false, reason: 'suppression-lookup-failed' };
  }
  if (suppressRow && suppressRow.length > 0) return { enrolled: false, reason: 'suppressed' };

  const now = Date.now();
  const rows = PERSONA5_MANIFEST.sequence.map((_, idx) => ({
    email: c.email,
    persona: PERSONA5_KEY,
    email_number: idx,
    scheduled_at: new Date(now + PERSONA5_OFFSET_MINUTES[idx] * 60_000).toISOString(),
    status: 'pending',
  }));

  const { error: insertErr, count } = await supabase
    .from('email_sequence_queue')
    .upsert(rows, { onConflict: 'email,persona,email_number', ignoreDuplicates: true, count: 'exact' });

  if (insertErr) {
    console.error('persona5-enroll: queue insert failed', insertErr);
    return { enrolled: false, reason: 'insert-failed' };
  }

  return { enrolled: true, rowCount: count ?? rows.length };
}

export { buildPersona1TemplateData as buildPersona5TemplateData } from './persona1-enroll';
