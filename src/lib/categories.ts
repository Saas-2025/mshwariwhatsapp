// Shared customer-category color palette + helpers.
export const CATEGORY_COLORS: Record<string, { dot: string; chip: string; solid: string }> = {
    emerald: { dot: 'bg-emerald-500', chip: 'bg-emerald-100 text-emerald-700', solid: 'bg-emerald-500' },
    blue: { dot: 'bg-blue-500', chip: 'bg-blue-100 text-blue-700', solid: 'bg-blue-500' },
    amber: { dot: 'bg-amber-500', chip: 'bg-amber-100 text-amber-700', solid: 'bg-amber-500' },
    rose: { dot: 'bg-rose-500', chip: 'bg-rose-100 text-rose-700', solid: 'bg-rose-500' },
    purple: { dot: 'bg-purple-500', chip: 'bg-purple-100 text-purple-700', solid: 'bg-purple-500' },
    cyan: { dot: 'bg-cyan-500', chip: 'bg-cyan-100 text-cyan-700', solid: 'bg-cyan-500' },
    slate: { dot: 'bg-slate-500', chip: 'bg-slate-100 text-slate-700', solid: 'bg-slate-500' },
};

export const CATEGORY_COLOR_KEYS = Object.keys(CATEGORY_COLORS);
export const catColor = (key?: string) => CATEGORY_COLORS[key || 'emerald'] || CATEGORY_COLORS.emerald;

export interface Category { _id: string; name: string; color: string; order?: number; }
