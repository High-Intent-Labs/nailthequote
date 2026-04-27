// Persona-3 (home / hiring / researching) enrollment helpers.

import type { SupabaseClient } from '@supabase/supabase-js';
import { PERSONA3_MANIFEST } from '../_generated/email-templates';
import type { CaptureContext } from './persona1-enroll';

export const PERSONA3_KEY = 'home_hiring_researching';

// 30 min, 5 days, 12 days, 21 days, 28 days.
const PERSONA3_OFFSET_MINUTES: number[] = [30, 5 * 24 * 60, 12 * 24 * 60, 21 * 24 * 60, 28 * 24 * 60];

export function qualifiesForPersona3(c: CaptureContext): boolean {
  return (
    c.toolSlug === 'load-calculator' &&
    c.segment === 'home' &&
    c.isDiy === false &&
    c.contractorStage === 'researching'
  );
}

export async function enrollPersona3(
  supabase: SupabaseClient,
  c: CaptureContext
): Promise<{ enrolled: boolean; reason?: string; rowCount?: number }> {
  if (!qualifiesForPersona3(c)) return { enrolled: false, reason: 'not-qualified' };

  const { data: suppressRow, error: suppressErr } = await supabase
    .from('email_unsubscribes')
    .select('email')
    .eq('email', c.email)
    .limit(1);
  if (suppressErr) {
    console.error('persona3-enroll: suppression lookup failed', suppressErr);
    return { enrolled: false, reason: 'suppression-lookup-failed' };
  }
  if (suppressRow && suppressRow.length > 0) return { enrolled: false, reason: 'suppressed' };

  const now = Date.now();
  const rows = PERSONA3_MANIFEST.sequence.map((_, idx) => ({
    email: c.email,
    persona: PERSONA3_KEY,
    email_number: idx,
    scheduled_at: new Date(now + PERSONA3_OFFSET_MINUTES[idx] * 60_000).toISOString(),
    status: 'pending',
  }));

  const { error: insertErr, count } = await supabase
    .from('email_sequence_queue')
    .upsert(rows, { onConflict: 'email,persona,email_number', ignoreDuplicates: true, count: 'exact' });

  if (insertErr) {
    console.error('persona3-enroll: queue insert failed', insertErr);
    return { enrolled: false, reason: 'insert-failed' };
  }

  return { enrolled: true, rowCount: count ?? rows.length };
}

export { buildPersona1TemplateData as buildPersona3TemplateData } from './persona1-enroll';
