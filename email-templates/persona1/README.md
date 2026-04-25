# Persona 1 — Email sequence templates (Tier A)

This directory contains the four nurture-sequence email templates for the **Home · Hiring · Not yet** persona on the Load Calculator funnel, plus a local preview harness.

**Tier A scope:** templates + render harness only. No live-site impact yet — the templates are inert until the Tier B scheduler (next PR) wires them up.

## What's here

```
persona1/
├── manifest.json              ← per-email metadata (subjects, preheader, CTA URL)
├── day0.liquid                ← Day 0 body (sizing recap + vocabulary primer)
├── day3.liquid                ← Day 3 body (10-item quote checklist)
├── day7.liquid                ← Day 7 body (IRA 25C tax-credit walkthrough)
├── day14.liquid               ← Day 14 body (3-quote ask)
├── partials/
│   └── footer.liquid          ← shared footer (unsub link, sender attribution)
├── fixtures/
│   ├── boston-cold-large.json ← 3,200 sqft Boston home, cold climate, 4 occupants
│   ├── phoenix-hot-small.json ← 1,500 sqft Phoenix home, hot climate, 2 occupants, bad insulation
│   └── seattle-mixed-medium.json ← 2,400 sqft Seattle home, marine climate, 5 occupants
├── render.mjs                 ← Node preview harness (writes to _preview/)
├── _preview/                  ← rendered HTML output (gitignored)
└── README.md                  ← this file
```

## How to preview the rendered emails

```bash
cd email-templates/persona1
npm install --no-save liquidjs
node render.mjs
open _preview/index.html       # or just open in your browser
```

The harness renders every (day × fixture) combination — 12 HTML files — and builds an `index.html` table you can navigate.

Each preview shows the **subject line, preheader, and rendered body** as the user would receive them.

## Personalization model

Every template uses two tiers of personalization:

- **Tier 1 — merge fields.** Direct substitution: `{{ home.tonnage }}`, `{{ location.city }}`, etc. Always rendered; no logic.
- **Tier 2 — conditional content blocks.** `{% if location.climate_region == "Cold" %}…{% endif %}` chooses different paragraphs based on the user's data.

Variables consumed (full list in `manifest.json`):

| Group | Fields |
|---|---|
| `home.*` | `sqft`, `cooling_btu`, `heating_btu`, `tonnage`, `occupants`, `insulation` |
| `location.*` | `city`, `state`, `state_slug`, `climate_region`, `iecc_zone`, `design_temp_low`, `design_temp_high` |
| Per-email | `cta_url` (Angi destination with utm tags), `rebate_lookup_url` (Day 7 only) |

All variables come from the existing `email_captures.calculation_data` jsonb in Supabase + a derived `state_slug` (lowercase 2-letter for the DSIRE URL). No new data instrumentation needed.

## Conditional fan-out (worst case)

| Email | Branches | Worst-case rendered versions |
|---|---|---|
| Day 0 | climate × occupants × insulation | 3 × 2 × 2 = 12 |
| Day 3 | sqft (3000+) × sqft (2500+) × climate | 2 × 2 × 3 = 12 |
| Day 7 | climate × tonnage × state | 3 × 3 × 50 = 450 (state is mostly URL-only) |
| Day 14 | none | 1 |

Each conditional branch only needs reviewing once — every individual user sees one rendered version.

## Liquid syntax notes

- The `comma` filter (e.g. `{{ home.sqft | comma }}`) is registered in `render.mjs` and will need to be registered identically in the Tier B Cloudflare Worker.
- Resend's unsubscribe placeholder is wrapped in `{% raw %}{{{unsubscribe_url}}}{% endraw %}` inside `partials/footer.liquid` so it survives Liquid render and reaches Resend's substitution layer intact.
- Subject lines also contain merge fields (e.g. `Your {{ location.city }} HVAC sizing…`) and must be rendered through Liquid before being passed to Resend's `subject:` field.

## Editorial principles applied

- **Every HVAC term defined plain English on first use.** The reader is assumed to have zero HVAC vocabulary on Day 0 and a working one by Day 14. Bolded terms in the body mark the first definition.
- **No invented claims.** Specific numbers (25C cap $2,000, IRS Form 5695 line 22a, CEE highest tier) trace to public IRS / DOE pages. No fabricated SLAs, savings %, or partner-product details about Angi.
- **No competitor names.** Per the project's "no competitor references in user-facing content" rule.
- **Confident-concierge tone.** Reads like a knowledgeable friend, not a marketing blast.

## What ships in Tier B (next PR, not this one)

- Supabase migration adding `email_sequence_queue` table.
- Cloudflare Worker that runs every 15 min, pulls due rows, hydrates these templates with user data, sends via Resend.
- Update to `functions/api/email-capture.ts` to enqueue the full Persona 1 sequence on capture for users tagged `home + hiring + not_yet`.
- Unsubscribe endpoint that suppresses all future sends for an email.

## What ships in Tier C (PR after that)

- `utm_medium=email&utm_content=…` already wired in the manifest's `cta_url_template`; the Tier B render step substitutes them.
- Admin dashboard split: email-driven vs. on-page CTA clicks per persona.
- Pause / kill-switch toggle in admin.

## Open questions for review (Tier A)

1. **Subject-line A/B testing.** Two options per email are listed in `manifest.json`. Tier B can pick at random, alternate by send, or run a structured A/B. Decide before Tier B ships.
2. **CTA URL format.** Currently sends every Day-N email to `request.angi.com/service-request/category/10211` with `utm_content=not_yet_email_<N>`. Per the project's existing persona-CTA work, this matches the on-page CTA destination. Confirm with Alison whether email CTAs should differ from on-page in any way.
3. **The `home.tonnage * 12000` math in Day 0.** Computed inline via Liquid's `times` filter. If we'd rather precompute it server-side, easy to swap.
4. **Tonnage edge cases.** Day 7 has separate branches for `<= 2`, `> 5`, and the implicit middle (no insertion). If the calc ever produces tonnage = 0 or > 10, current branches still work but worth a sanity check.
