// Enriched ZIP lookup for HVAC tool pages.
//
// GET /api/zip-lookup?zip=02108
//
// Returns city + state + climate region + IECC zone + representative
// design temperatures so the frontend can show a pro-grade confirmation
// card under the ZIP input ("Boston, MA · Cool (IECC 5A) · 88°F / 9°F").
//
// Climate region + state come from our existing ZIP3 → region dataset
// (../../src/data/zip-climate.json). City comes from api.zippopotam.us
// (free, unlimited, US-coverage). Design temps are per-region ASHRAE 90.1
// / Manual J Table 1A approximations keyed off the 5 climate regions —
// close enough for a "fast estimate" tool; real Manual J uses per-city
// data from ~300 stations of record.
//
// Response is cached 24h at the edge (ZIP data is effectively static).

import zipData from '../../src/data/zip-climate.json';

type Region = 'hot' | 'warm' | 'mixed' | 'cool' | 'cold';

type ZipEntry = { state: string; region: Region };

const DATA = zipData as Record<string, ZipEntry>;

// Representative IECC zone + design temps per climate region.
// designCoolingDB = 1% cooling dry-bulb design temp (°F).
// designHeatingDB = 99% heating dry-bulb design temp (°F).
// Values are midpoints of the IECC zone range covered by each region —
// actual per-city values vary ±5°F within the zone.
const REGION_META: Record<
  Region,
  { label: string; ieccZone: string; designCoolingDB: number; designHeatingDB: number }
> = {
  hot:   { label: 'Hot',   ieccZone: '2A',      designCoolingDB: 95, designHeatingDB: 35 },
  warm:  { label: 'Warm',  ieccZone: '3A',      designCoolingDB: 92, designHeatingDB: 28 },
  mixed: { label: 'Mixed', ieccZone: '4A',      designCoolingDB: 90, designHeatingDB: 18 },
  cool:  { label: 'Cool',  ieccZone: '5A',      designCoolingDB: 88, designHeatingDB:  9 },
  cold:  { label: 'Cold',  ieccZone: '6A / 7',  designCoolingDB: 85, designHeatingDB: -5 },
};

function json(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      ...extraHeaders,
    },
  });
}

export const onRequestGet: PagesFunction = async ({ request }) => {
  const url = new URL(request.url);
  const zip = (url.searchParams.get('zip') || '').trim();

  if (!/^\d{5}$/.test(zip)) {
    return json({ error: 'invalid_zip', zip }, 400);
  }

  const zip3 = zip.slice(0, 3);
  const entry = DATA[zip3];

  if (!entry) {
    // ZIP3 not in our climate dataset → client should fall back to
    // the manual region picker. Return 404 so the client can branch.
    return json({ error: 'zip_not_found', zip }, 404);
  }

  // City lookup via Zippopotam (free, no auth, US coverage).
  // Degrade silently if the upstream is slow or down — climate/state
  // from our own data is still usable for display.
  let city: string | null = null;
  try {
    const upstream = await fetch(`https://api.zippopotam.us/us/${zip}`, {
      // Small timeout via AbortController to avoid hanging the page load.
      signal: AbortSignal.timeout(2500),
    });
    if (upstream.ok) {
      const data = (await upstream.json()) as { places?: Array<{ 'place name'?: string }> };
      const place = data.places?.[0];
      if (place && typeof place['place name'] === 'string') {
        city = place['place name'];
      }
    }
  } catch {
    // Network / timeout / parse — fall through with city = null.
  }

  const meta = REGION_META[entry.region];

  return json(
    {
      zip,
      city, // null if upstream lookup failed; client should still render the card
      state: entry.state,
      region: entry.region,
      regionLabel: meta.label,
      ieccZone: meta.ieccZone,
      designCoolingDB: meta.designCoolingDB,
      designHeatingDB: meta.designHeatingDB,
    },
    200,
    {
      // ZIP ↔ city/state/region is effectively static; cache aggressively
      // at the Cloudflare edge and in the browser.
      'Cache-Control': 'public, max-age=86400, s-maxage=86400',
    },
  );
};
