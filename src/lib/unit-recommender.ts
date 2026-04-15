// Unit-type decision tree for the consumer "What Size AC Do I Need?" tool.
//
// Given the space type, size, climate region, and a BTU load, picks the
// recommended equipment type (mini-split / window / portable / through-wall /
// central-zone-extension) and returns a cost range + install context.
//
// Goal: route *high-value* leads (mini-split / through-wall / central-zone)
// into the email gate (they need an installer), and let *low-value* cases
// (window / portable) see their answer inline without paying for an email
// capture we can't monetize. This decision is what makes the tool an Angi
// feeder rather than a generic BTU calculator.

import type { Region } from './climate';

export type SpaceType =
  | 'garage'
  | 'addition'        // addition / sunroom / bonus room / finished attic
  | 'bedroom'         // hot upstairs bedroom / master
  | 'basement'        // finished basement
  | 'home-office'     // spare room / detached office / ADU / shed
  | 'whole-house'
  | 'other';

export type UnitType =
  | 'mini-split-single'
  | 'mini-split-multi'
  | 'through-wall'
  | 'central-zone-extension'
  | 'window'
  | 'portable'
  | 'central-system'; // for whole-house fallback

export interface RecommendationInput {
  space: SpaceType;
  sqft: number;
  region: Region;
  insulation: 'excellent' | 'good' | 'average' | 'poor' | 'bad';
  coolingBTU: number;
  closestStandardBTU: number;
  closestStandardLabel: string;
}

export interface Recommendation {
  unitType: UnitType;
  unitLabel: string;             // human-readable ("Single-zone ductless mini-split")
  why: string;                   // 1-sentence reasoning ("No ductwork to garage, high cooling load")
  needsPro: boolean;             // gate the email on this
  installCostLow: number;        // USD, rough 2026 installed cost range
  installCostHigh: number;
  installNotes: string;          // short paragraph on what the install involves
  alternativeNote?: string;      // optional — "Window AC not viable because..."
  isAngiLead: boolean;           // used for PostHog property
}

// ---------------------------------------------------------------------------
// Cost ranges (USD, installed) — 2026 US national averages, rough brackets.
// These are intentionally wide; we communicate "ballpark" not a quote.
// ---------------------------------------------------------------------------
const COST: Record<UnitType, [number, number]> = {
  'mini-split-single':       [3800, 6500],
  'mini-split-multi':        [8000, 15000],
  'through-wall':            [1800, 3200],
  'central-zone-extension':  [2500, 5500],
  'window':                  [250, 700],      // DIY, equipment only
  'portable':                [350, 900],      // DIY, equipment only
  'central-system':          [8000, 16000],
};

const LABELS: Record<UnitType, string> = {
  'mini-split-single':      'Single-zone ductless mini-split',
  'mini-split-multi':       'Multi-zone ductless mini-split',
  'through-wall':           'Through-the-wall AC',
  'central-zone-extension': 'Central-AC zone extension',
  'window':                 'Window AC unit',
  'portable':               'Portable AC unit',
  'central-system':         'Central air-conditioning system',
};

const PRO_TYPES = new Set<UnitType>([
  'mini-split-single', 'mini-split-multi', 'through-wall',
  'central-zone-extension', 'central-system',
]);

const ANGI_LEAD_TYPES = new Set<UnitType>([
  'mini-split-single', 'mini-split-multi', 'through-wall',
  'central-zone-extension', 'central-system',
]);

const INSTALL_NOTES: Record<UnitType, string> = {
  'mini-split-single':
    'Installation takes ~1 day and requires a licensed HVAC pro. The job involves mounting the indoor head, running the refrigerant line set and electrical (typically 240V), drilling a small penetration through the wall, and vacuuming + charging the system. Not a DIY job unless you buy a pre-charged line-set kit (e.g. MRCOOL).',
  'mini-split-multi':
    'Installation takes 1–2 days and requires a licensed HVAC pro. Involves mounting multiple indoor heads, running refrigerant line sets for each zone, a single outdoor condenser sized to the total load, electrical work (240V), and a vacuum + charge of the whole system.',
  'through-wall':
    'Install takes a half day. Involves cutting a sized hole through an exterior wall, installing a steel sleeve, running a dedicated 240V circuit, and slotting the unit into the sleeve. Usually done by a handyman or HVAC pro — not a typical DIY job because of the wall cut and electrical.',
  'central-zone-extension':
    'Install takes 1–2 days. Involves running new supply + return ductwork from the existing system, potentially upsizing the blower, and adding dampers or a bypass. Your existing central system must have unused capacity — a pro needs to confirm this before quoting.',
  'window':
    'Fully DIY. Mount in a double-hung window with the included brackets, plug into a standard outlet (most units under 12,000 BTU), and you\'re done in 30 minutes. No pro needed.',
  'portable':
    'Fully DIY. Roll it into the room, vent the exhaust hose out a window with the included kit, plug into a standard outlet. Loudest and least efficient option — fine for short-term use.',
  'central-system':
    'Full system install takes 1–2 days and requires a licensed HVAC pro. This is a whole-house project — a mini-split sizing tool isn\'t the right place for it. Use our whole-house Load Calculator instead.',
};

// ---------------------------------------------------------------------------
// Decision tree
// ---------------------------------------------------------------------------
export function recommendUnit(i: RecommendationInput): Recommendation {
  const btu = i.coolingBTU;
  let unit: UnitType;
  let why: string;
  let alternativeNote: string | undefined;

  switch (i.space) {
    case 'garage':
      // Garages almost always lack ductwork and insulation. Mini-split is the
      // only sensible option above ~150 sq ft; through-wall for very small
      // garages. Window AC is rarely viable (no double-hung windows, and
      // garage doors can't mount a unit).
      if (i.sqft < 150 && btu < 9000) {
        unit = 'through-wall';
        why = `Small garage — a through-the-wall unit is cheaper than a mini-split and delivers enough capacity for ${i.sqft} sq ft.`;
        alternativeNote = 'Window AC is rarely viable in a garage — no double-hung windows and garage doors can\'t mount a unit.';
      } else {
        unit = 'mini-split-single';
        why = `Garages have no ductwork and usually poor insulation, so a ductless mini-split is the right fit for ${i.sqft} sq ft${i.region === 'hot' || i.region === 'warm' ? ' — especially in your climate' : ''}.`;
        alternativeNote = 'Window AC is rarely viable in a garage — no double-hung windows and garage doors can\'t mount a unit.';
      }
      break;

    case 'addition':
      // Additions and sunrooms are often built without HVAC runs. Mini-split
      // is the go-to — central zone extension only when you know existing
      // ducts have capacity (we can't know from inputs alone, so default to
      // mini-split).
      unit = 'mini-split-single';
      why = `Additions and sunrooms are almost always built without ductwork, so a ductless mini-split is the standard solution — fast to install and quiet.`;
      break;

    case 'bedroom':
      // "Hot upstairs bedroom" is the classic case. For <400 sq ft, a well-sized
      // window AC works and homeowners often prefer the $500 solution. For
      // larger rooms or master suites, mini-split.
      if (i.sqft <= 400 && btu <= 10000 && i.region !== 'hot') {
        unit = 'window';
        why = `At ${i.sqft} sq ft, a window AC in the ${Math.round(i.closestStandardBTU / 1000)}K BTU range is the cheapest, simplest fix for a hot bedroom.`;
        alternativeNote = 'Want something quieter and always-on? A single-zone mini-split costs more upfront but runs silently and heats in winter.';
      } else {
        unit = 'mini-split-single';
        why = `At ${i.sqft} sq ft, a mini-split gives you quiet always-on comfort — and in your climate it\'ll heat in winter too.`;
      }
      break;

    case 'basement':
      // Finished basements often have humidity problems. Mini-split with dry
      // mode is the right answer. Portable as a low-end fallback but we don't
      // recommend it.
      unit = 'mini-split-single';
      why = `Finished basements almost always need dehumidification as well as cooling — a mini-split with dry mode handles both.`;
      break;

    case 'home-office':
      // Detached/ADU/shed office → mini-split for sure (no ducts). In-house
      // office under 250 sq ft with good insulation → window or portable is
      // often fine.
      if (i.sqft <= 250 && i.insulation !== 'poor' && i.insulation !== 'bad') {
        unit = 'window';
        why = `For a small in-home office, a ${Math.round(i.closestStandardBTU / 1000)}K BTU window unit is a cheap, quiet-enough fix.`;
        alternativeNote = 'If the office is in a detached space (shed / ADU / garage conversion) you\'ll need a mini-split instead.';
      } else {
        unit = 'mini-split-single';
        why = `For a full-time work space you want quiet, controllable, always-on comfort — a mini-split is the standard choice.`;
      }
      break;

    case 'whole-house':
      // Caller should route to the Load Calculator, but we need a graceful
      // fallback.
      unit = 'central-system';
      why = 'For whole-house sizing, use our Whole-House Load Calculator — it accounts for the central distribution.';
      break;

    default:
      // 'other' — conservative default: mini-split.
      unit = 'mini-split-single';
      why = `A ductless mini-split is the most flexible option for a single room — works without ducts, heats and cools.`;
      break;
  }

  const [costLow, costHigh] = COST[unit];
  return {
    unitType: unit,
    unitLabel: LABELS[unit],
    why,
    needsPro: PRO_TYPES.has(unit),
    installCostLow: costLow,
    installCostHigh: costHigh,
    installNotes: INSTALL_NOTES[unit],
    alternativeNote,
    isAngiLead: ANGI_LEAD_TYPES.has(unit),
  };
}

// Helper for display
export function formatCost(low: number, high: number): string {
  const fmt = (n: number) =>
    n < 1000 ? `$${n}` : `$${(n / 1000).toFixed(n % 1000 === 0 ? 0 : 1)}K`;
  return `${fmt(low)}–${fmt(high)}`;
}
