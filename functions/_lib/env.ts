export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  RESEND_API_KEY: string;
  RESEND_AUDIENCE_ID: string;
  // Tier B (email nurture sequence) additions:
  EMAIL_SCHEDULER_SECRET: string;
  UNSUBSCRIBE_SIGNING_KEY: string;
  // Tier C (admin panel + Resend webhook) addition:
  // Shared secret in the webhook URL query string. Configure in the Resend
  // dashboard when creating the webhook: webhook URL ends in
  // "?secret=<RESEND_WEBHOOK_SECRET>". The endpoint rejects any POST without
  // the matching secret. Keep separate from EMAIL_SCHEDULER_SECRET so the
  // two can be rotated independently.
  RESEND_WEBHOOK_SECRET: string;
}
