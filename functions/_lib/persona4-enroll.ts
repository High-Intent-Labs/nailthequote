// Persona-4 (home / DIY) enrollment helpers.

import type { SupabaseClient } from '@supabase/supabase-js';
import { PERSONA4_MANIFEST } from '../_generated/email-templates';
import type { CaptureContext } from './persona1-enroll';

export const PERSONA4_KEY = 'home_diy';

// 30 min, 4 days, 10 days, 21 days, 35 days, 45 days.
const PERSONA4_OFFSET_MINUTES: number[] = [30, 4 * 24 * 60, 10 * 24 * 60, 21 * 24 * 60, 35 * 24 * 60, 45 * 24 * 60];

export function qualifiesForPersona4(c: CaptureContext): boolean {
  return c.toolSlug === 'load-calculator' && c.segment === 'home' && c.isDiy === true;
}

export async function enrollPersona4(
  supabase: SupabaseClient,
  c: CaptureContext
): Promise<{ enrolled: boolean; reason?: string; rowCount?: number }> {
  if (!qualifiesForPersona4(c)) return { enrolled: false, reason: 'not-qualified' };

  const { data: suppressRow, error: suppressErr } = await supabase
    .from('email_unsubscribes')
    .select('email')
    .eq('email', c.email)
    .limit(1);
  if (suppressErr) {
    console.error('persona4-enroll: suppression lookup failed', suppressErr);
    return { enrolled: false, reason: 'suppression-lookup-failed' };
  }
  if (suppressRow && suppressRow.length > 0) return { enrolled: false, reason: 'suppressed' };

  const now = Date.now();
  const rows = PERSONA4_MANIFEST.sequence.map((_, idx) => ({
    email: c.email,
    persona: PERSONA4_KEY,
    email_number: idx,
    scheduled_at: new Date(now + PERSONA4_OFFSET_MINUTES[idx] * 60_000).toISOString(),
    status: 'pending',
  }));

  const { error: insertErr, count } = await supabase
    .from('email_sequence_queue')
    .upsert(rows, { onConflict: 'email,persona,email_number', ignoreDuplicates: true, count: 'exact' });

  if (insertErr) {
    console.error('persona4-enroll: queue insert failed', insertErr);
    return { enrolled: false, reason: 'insert-failed' };
  }

  return { enrolled: true, rowCount: count ?? rows.length };
}

export { buildPersona1TemplateData as buildPersona4TemplateData } from './persona1-enroll';
