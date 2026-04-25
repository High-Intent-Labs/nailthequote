// Liquid engine wrapper for email-template rendering. Used by the scheduler
// (functions/api/email-scheduler.ts) to hydrate persona templates with each
// user's calculation_data + per-send context (cta_url, etc.).
//
// liquidjs is a pure-JS Liquid implementation; it works in Cloudflare's
// Workers runtime without any node-specific shims. We register the same
// `comma` filter the local preview harness uses (email-templates/persona1/
// render.mjs) so production output matches preview output byte-for-byte.

import { Liquid } from 'liquidjs';
import {
  PERSONA1_TEMPLATES,
  PERSONA1_TEMPLATE_BY_NUMBER,
  PERSONA1_MANIFEST,
  PERSONA2_TEMPLATES,
  PERSONA2_TEMPLATE_BY_NUMBER,
  PERSONA2_MANIFEST,
  type Persona1TemplateKey,
  type Persona2TemplateKey,
} from '../_generated/email-templates';

let cachedEngine: Liquid | null = null;

/** Build (and cache) a Liquid engine with the `comma` filter registered. */
export function getEngine(): Liquid {
  if (cachedEngine) return cachedEngine;
  const engine = new Liquid({
    // No filesystem lookups — production templates have their footer partial
    // pre-inlined by scripts/embed-email-templates.mjs, so there's nothing
    // to resolve at render time.
    extname: '.liquid',
  });
  engine.registerFilter('comma', (n: unknown) => {
    if (n == null || n === '') return '';
    const num = Number(n);
    if (!Number.isFinite(num)) return String(n);
    return num.toLocaleString('en-US');
  });
  cachedEngine = engine;
  return engine;
}

export interface RenderResult {
  subject: string;
  html: string;
  preheader: string;
}

/**
 * Render the persona-1 email at index `emailNumber` (0-3) with the given data.
 * Returns the rendered subject (option 1 of the manifest) + body HTML + preheader.
 *
 * `data` should already contain everything the template references —
 * home.*, location.*, cta_url, rebate_lookup_url. See buildPersona1TemplateData
 * in persona1-enroll.ts for the canonical builder.
 */
export async function renderPersona1Email(
  emailNumber: number,
  data: Record<string, unknown>
): Promise<RenderResult> {
  const key = PERSONA1_TEMPLATE_BY_NUMBER[emailNumber] as Persona1TemplateKey | undefined;
  if (!key) throw new Error(`invalid email_number: ${emailNumber}`);
  const sequenceEntry = PERSONA1_MANIFEST.sequence[emailNumber];
  const templateSource = PERSONA1_TEMPLATES[key];

  const engine = getEngine();
  const html = await engine.parseAndRender(templateSource, data);
  // Subject line option 1 is the default; option 2 is reserved for A/B tests.
  const subject = await engine.parseAndRender(sequenceEntry.subject_lines[0], data);
  // Preheader is plain text but we still render it through Liquid in case future
  // preheaders include merge fields.
  const preheader = await engine.parseAndRender(sequenceEntry.preheader, data);

  return { subject, html, preheader };
}

/**
 * Render the persona-2 email at index `emailNumber` (0-2) with the given data.
 * Mirrors renderPersona1Email but routes through the persona-2 manifest +
 * templates. Data shape is identical to persona-1 (both use the load-calc
 * email_captures row).
 */
export async function renderPersona2Email(
  emailNumber: number,
  data: Record<string, unknown>
): Promise<RenderResult> {
  const key = PERSONA2_TEMPLATE_BY_NUMBER[emailNumber] as Persona2TemplateKey | undefined;
  if (!key) throw new Error(`invalid email_number: ${emailNumber}`);
  const sequenceEntry = PERSONA2_MANIFEST.sequence[emailNumber];
  const templateSource = PERSONA2_TEMPLATES[key];

  const engine = getEngine();
  const html = await engine.parseAndRender(templateSource, data);
  const subject = await engine.parseAndRender(sequenceEntry.subject_lines[0], data);
  const preheader = await engine.parseAndRender(sequenceEntry.preheader, data);

  return { subject, html, preheader };
}
