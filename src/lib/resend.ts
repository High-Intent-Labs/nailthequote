import { Resend } from 'resend';

export function getResend() {
  return new Resend(import.meta.env.RESEND_API_KEY);
}

export function getAudienceId() {
  return import.meta.env.RESEND_AUDIENCE_ID;
}
