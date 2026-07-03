/**
 * The runtime value types a macro variable / expression can hold. Arrays (from repeated `extract`)
 * answer the iMacros "no arrays" gap; there is no object type on purpose (keeps the safe expression
 * language small and total). Coercions below are deliberate and total (never throw).
 */
export type MacroValue = string | number | boolean | string[];

/** Coerce to string. Arrays join with commas; used by `{{var}}` interpolation and `fill`/`navigate`. */
export function toStr(v: MacroValue): string {
  if (Array.isArray(v)) return v.join(',');
  return String(v);
}

/** Coerce to number (arrays → length; booleans → 0/1; non-numeric strings → 0). Total. */
export function toNum(v: MacroValue): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  if (Array.isArray(v)) return v.length;
  const n = Number(v.trim());
  return Number.isFinite(n) ? n : 0;
}

/** Truthiness: '' / '0' / 'false' / 0 / false / [] are falsy. */
export function toBool(v: MacroValue): boolean {
  if (typeof v === 'boolean') return v;
  if (typeof v === 'number') return v !== 0;
  if (Array.isArray(v)) return v.length > 0;
  const t = v.trim().toLowerCase();
  return t.length > 0 && t !== 'false' && t !== '0';
}
