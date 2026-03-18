import { createClient } from '@supabase/supabase-js';

export function getSupabaseClient() {
  const url = import.meta.env.SUPABASE_URL;
  const key = import.meta.env.SUPABASE_ANON_KEY;
  return createClient(url, key);
}

export function getSupabaseAdmin() {
  const url = import.meta.env.SUPABASE_URL;
  const key = import.meta.env.SUPABASE_SERVICE_ROLE_KEY;
  return createClient(url, key);
}
