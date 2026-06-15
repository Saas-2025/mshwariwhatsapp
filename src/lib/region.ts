// Shared pricing-region helpers: detect the visitor's region (EG vs SA/international)
// and pick the right price/currency from a plan.

const baseUrl = () => (import.meta.env.VITE_API_URL || 'http://localhost:3050').replace(/\/$/, '');

export type Region = 'EG' | 'SA';

// Contact numbers for "subscribe / upgrade"
export const CONTACTS = {
  EG: { label: 'مصر', flag: '🇪🇬', phone: '201093957856', display: '+20 109 395 7856' },
  SA: { label: 'السعودية', flag: '🇸🇦', phone: '966534859975', display: '+966 53 485 9975' },
};

// Resolve the pricing region purely from the visitor's IP country (cached for the session).
// Egypt (EG) => Egyptian pricing, everywhere else => Saudi pricing.
export async function detectRegion(): Promise<Region> {
  const cached = sessionStorage.getItem('autoRegion');
  if (cached === 'EG' || cached === 'SA') return cached;

  try {
    const res = await fetch(`${baseUrl()}/api/geo`);
    if (res.ok) {
      const d = await res.json();
      const r: Region = d.region === 'EG' ? 'EG' : 'SA';
      sessionStorage.setItem('autoRegion', r);
      return r;
    }
  } catch { /* ignore */ }
  return 'EG';
}

// Pick {amount, currency} for a plan in the given region + billing cycle.
// If the chosen region's price is unset (0) but the other region has a price,
// fall back to it so a paid plan never shows as "free".
export function regionPrice(plan: any, region: Region, cycle: 'monthly' | 'yearly'): { amount: number; currency: string } {
  const eg = { amount: Number(cycle === 'monthly' ? plan.priceMonthly : plan.priceYearly) || 0, currency: plan.currency || 'ج.م' };
  const sa = { amount: Number(cycle === 'monthly' ? plan.priceMonthlySA : plan.priceYearlySA) || 0, currency: plan.currencySA || 'ر.س' };
  const primary = region === 'EG' ? eg : sa;
  const fallback = region === 'EG' ? sa : eg;
  if (primary.amount > 0) return primary;
  if (fallback.amount > 0) return fallback;
  return primary; // both 0 => genuinely free
}
