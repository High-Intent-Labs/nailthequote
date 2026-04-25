#!/usr/bin/env node
/*
 * render.mjs — local preview harness for the persona1 nurture sequence.
 *
 * Renders every (day, fixture) combination in this directory to _preview/*.html
 * so you can open them in a browser and review the actual output a user would see.
 *
 * Usage (from this directory):
 *   npm install --no-save liquidjs   # one-time, dependency only used by the harness
 *   node render.mjs
 *
 * No live-site impact — this script is review-only. Templates are otherwise
 * inert until the Tier B scheduler (separate PR) wires them up.
 */
import { Liquid } from 'liquidjs';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PREVIEW_DIR = path.join(HERE, '_preview');

const engine = new Liquid({
  root: HERE,
  partials: path.join(HERE, 'partials'),
  extname: '.liquid',
});

// Custom filter: format integers with thousands separators.
engine.registerFilter('comma', (n) => {
  if (n == null || n === '') return '';
  return Number(n).toLocaleString('en-US');
});

const manifest = JSON.parse(fs.readFileSync(path.join(HERE, 'manifest.json'), 'utf8'));

const fixtureFiles = fs.readdirSync(path.join(HERE, 'fixtures'))
  .filter((f) => f.endsWith('.json'))
  .map((f) => ({
    name: f.replace(/\.json$/, ''),
    data: JSON.parse(fs.readFileSync(path.join(HERE, 'fixtures', f), 'utf8')),
  }));

fs.mkdirSync(PREVIEW_DIR, { recursive: true });

const indexEntries = [];

for (const fixture of fixtureFiles) {
  for (const email of manifest.sequence) {
    const html = await engine.renderFile(email.template.replace(/\.liquid$/, ''), fixture.data);
    const subjectsRendered = await Promise.all(
      email.subject_lines.map((s) => engine.parseAndRender(s, fixture.data))
    );

    const wrapped = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Day ${email.day} — ${fixture.name}</title>
<style>
  body { background:#f4f4f5; font-family:-apple-system,sans-serif; margin:0; padding:0; }
  .preview-meta { background:#1f2937; color:#fff; padding:16px 24px; font-size:13px; line-height:1.6; }
  .preview-meta strong { color:#fbbf24; }
  .preview-meta code { background:#374151; padding:2px 6px; border-radius:3px; font-size:12px; }
  .preview-meta a { color:#60a5fa; }
  .email-frame { background:#fff; max-width:600px; margin:24px auto; box-shadow:0 1px 3px rgba(0,0,0,0.1); }
</style>
</head><body>
<div class="preview-meta">
  <div><strong>Fixture:</strong> ${fixture.name} &nbsp; <strong>Day:</strong> ${email.day}</div>
  <div style="margin-top:6px;"><strong>Subject (option 1):</strong> ${escapeHtml(subjectsRendered[0])}</div>
  ${subjectsRendered[1] ? `<div><strong>Subject (option 2):</strong> ${escapeHtml(subjectsRendered[1])}</div>` : ''}
  <div style="margin-top:6px;"><strong>Preheader:</strong> ${escapeHtml(email.preheader)}</div>
</div>
<div class="email-frame">${html}</div>
</body></html>`;

    const outName = `day${email.day}__${fixture.name}.html`;
    fs.writeFileSync(path.join(PREVIEW_DIR, outName), wrapped);
    indexEntries.push({ outName, day: email.day, fixture: fixture.name, subject: subjectsRendered[0] });
    console.log(`  rendered _preview/${outName}`);
  }
}

// Build a small index page so you can navigate the previews.
const indexHtml = `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>Persona 1 — preview index</title>
<style>
  body { font-family:-apple-system,sans-serif; max-width:900px; margin:32px auto; padding:0 24px; color:#111827; }
  h1 { font-size:22px; }
  table { border-collapse:collapse; width:100%; margin-top:16px; }
  th, td { text-align:left; padding:10px 12px; border-bottom:1px solid #e5e7eb; font-size:14px; }
  th { background:#f3f4f6; }
  a { color:#2563eb; text-decoration:none; }
  a:hover { text-decoration:underline; }
  .day-pill { display:inline-block; background:#fff7ed; color:#c2410c; border-radius:99px; padding:2px 10px; font-size:12px; font-weight:600; }
</style>
</head><body>
<h1>Persona 1 (Home · Hiring · Not yet) — rendered previews</h1>
<p style="color:#6b7280;font-size:14px;">${indexEntries.length} renders across ${fixtureFiles.length} fixtures and ${manifest.sequence.length} emails. Click any row to view the rendered email + the subject and preheader that would ship.</p>
<table>
  <thead><tr><th>Day</th><th>Fixture</th><th>Subject</th><th></th></tr></thead>
  <tbody>
    ${indexEntries.map((e) => `
      <tr>
        <td><span class="day-pill">Day ${e.day}</span></td>
        <td>${escapeHtml(e.fixture)}</td>
        <td>${escapeHtml(e.subject)}</td>
        <td><a href="${e.outName}">open &rarr;</a></td>
      </tr>`).join('')}
  </tbody>
</table>
</body></html>`;

fs.writeFileSync(path.join(PREVIEW_DIR, 'index.html'), indexHtml);
console.log(`\nWrote ${indexEntries.length} previews + index.html. Open _preview/index.html in your browser.`);

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}
