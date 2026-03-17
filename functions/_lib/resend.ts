import { Resend } from 'resend';
import type { Env } from './env';

export function getResend(env: Env) {
  return new Resend(env.RESEND_API_KEY);
}

export function getAudienceId(env: Env) {
  return env.RESEND_AUDIENCE_ID;
}
