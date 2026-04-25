// Persona-2 (home / hiring / has_estimates) enrollment helpers.
//
// Called from functions/api/email-capture.ts after a successful capture row
// is inserted. If the user qualifies for the persona, we insert 3 rows into
// email_sequence_queue with staggered scheduled_at timestamps. The scheduler
// (functions/api/email-scheduler.ts) handles delivery from there.

import type { SupabaseClient } from '@supabase/supabase-js';
import { PERSONA2_MANIFEST } from '../_generated/email-templates';
import type { CaptureContext } from './persona1-enroll';

export const PERSONA2_KEY = 'home_hiring_has_quotes';

// Day offsets for the 3 emails. The first one fires 30 min after capture
// so it doesn't collide with the transactional results email.
//
// 30 min, 3 days, 10 days. Tighter cadence than persona1 because these
// users are already in active comparison mode.
const PERSONA2_OFFSET_MINUTES: number[] = [30, 3 * 24 * 60, 10 * 24 * 60];

/** Returns true if this capture qualifies for persona2 enrollment. */
export function qualifiesForPersona2(c: CaptureContext): boolean {
  return (
    c.toolSlug === 'load-calculator' &&
    c.segment === 'home' &&
    c.isDiy === false &&
    c.contractorStage === 'has_estimates'
  );
}

/**
 * Enroll a capture in the persona2 sequence. Idempotent — the unique index
 * (email, persona, email_number) makes re-enrollment a no-op for users who
 * resubmit the calculator. Suppresses enrollment if the user is on the
 * email_unsubscribes list.
 *
 * Logs failures but never throws — enrollment must not break the user-facing
 * capture flow. The scheduler tolerates partial enrollments (it'll send
 * whichever rows actually got inserted).
 */
export async function enrollPersona2(
  supabase: SupabaseClient,
  c: CaptureContext
): Promise<{ enrolled: boolean; reason?: string; rowCount?: number }> {
  if (!qualifiesForPersona2(c)) {
    return { enrolled: false, reason: 'not-qualified' };
  }

  const { data: suppressRow, error: suppressErr } = await supabase
    .from('email_unsubscribes')
    .select('email')
    .eq('email', c.email)
    .limit(1);
  if (suppressErr) {
    console.error('persona2-enroll: suppression lookup failed', suppressErr);
    return { enrolled: false, reason: 'suppression-lookup-failed' };
  }
  if (suppressRow && suppressRow.length > 0) {
    return { enrolled: false, reason: 'suppressed' };
  }

  const now = Date.now();
  const rows = PERSONA2_MANIFEST.sequence.map((_, idx) => ({
    email: c.email,
    persona: PERSONA2_KEY,
    email_number: idx,
    scheduled_at: new Date(now + PERSONA2_OFFSET_MINUTES[idx] * 60_000).toISOString(),
    status: 'pending',
  }));

  const { error: insertErr, count } = await supabase
    .from('email_sequence_queue')
    .upsert(rows, { onConflict: 'email,persona,email_number', ignoreDuplicates: true, count: 'exact' });

  if (insertErr) {
    console.error('persona2-enroll: queue insert failed', insertErr);
    return { enrolled: false, reason: 'insert-failed' };
  }

  return { enrolled: true, rowCount: count ?? rows.length };
}

// Persona-2 uses the same template-data shape as persona-1: both pull from
// the load-calculator email_captures row and project to { home, location,
// cta_url, rebate_lookup_url }. Re-export the canonical builder so the
// scheduler can dispatch on persona key without importing both modules.
export { buildPersona1TemplateData as buildPersona2TemplateData } from './persona1-enroll';
