import type { Trade } from './types';

export const trades: Trade[] = [
  { name: 'HVAC', slug: 'hvac', icon: '❄️', toolCount: 24, status: 'live' },
  { name: 'Electrical', slug: 'electrical', icon: '⚡', toolCount: 0, status: 'coming' },
  { name: 'Roofing', slug: 'roofing', icon: '🏠', toolCount: 0, status: 'coming' },
  { name: 'Painting', slug: 'painting', icon: '🖌️', toolCount: 0, status: 'coming' },
  { name: 'Landscaping', slug: 'landscaping', icon: '🌿', toolCount: 0, status: 'coming' },
  { name: 'General Contractor', slug: 'gc', icon: '🛠️', toolCount: 0, status: 'coming' },
  { name: 'Handyman', slug: 'handyman', icon: '🧰', toolCount: 0, status: 'coming' },
  { name: 'Pest Control', slug: 'pest-control', icon: '🐛', toolCount: 0, status: 'coming' },
  { name: 'Cleaning', slug: 'cleaning', icon: '✨', toolCount: 0, status: 'coming' },
  { name: 'Plumbing', slug: 'plumbing', icon: '🔧', toolCount: 0, status: 'coming' },
];

export function getTradeBySlug(slug: string): Trade | undefined {
  return trades.find(t => t.slug === slug);
}

export function getLiveTrades(): Trade[] {
  return trades.filter(t => t.status === 'live');
}
